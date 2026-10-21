# Spotter Architecture

Status: Approved architecture baseline. Items in "Decisions to confirm during
scaffolding" remain unresolved implementation choices.

## System overview

Spotter uses a browser client for the interactive and offline experience and a
small HTTP service for canonical persistence.

```text
React PWA
  |-- IndexedDB: active workout, cached references, sync outbox
  |
  | HTTPS / JSON
  v
Express application
  |-- /api/*       API and synchronization
  |-- /*           compiled PWA assets and navigation fallback
  v
SQLite database in /data
```

The production container runs one Node.js process. Express serves both the API
and static client files, avoiding a second web-server image or a multi-container
deployment for the initial release.

## Proposed repository layout

```text
apps/
  server/          Express application, API routes, and database access
  web/             React PWA, IndexedDB, and synchronization client
packages/
  shared/          Domain types, API contracts, and validation schemas
docs/              Product and architecture documentation
.github/workflows/ Validation and image-publishing workflows
Dockerfile         Multi-stage production image
package.json       Workspace scripts and shared tool configuration
```

The web and server applications share wire-format schemas from `packages/shared`
but do not share persistence-specific models. This keeps browser storage and
SQLite implementation details from leaking into the API contract.

## Client application

### React PWA

The client is a React and TypeScript application built with Vite. A PWA plugin
will generate the web manifest and service worker.

The service worker owns application-shell and static-asset caching. It must not
be treated as the source of truth for workout data; that belongs in IndexedDB.
Separating these concerns makes service-worker upgrades safer and keeps workout
records queryable by application code.

The light/dark appearance choice is a device-only preference stored in
`localStorage`, separate from workout and synchronization state. A small inline
bootstrap in the HTML applies the saved theme (or the operating-system
preference when unset) before React and the stylesheet render, avoiding an
incorrect-theme flash. Theme changes also update the browser theme-color
metadata.

The catalogue has separate muscle and exercise views. Muscles are focused
reference records. Exercises use a compact image/title/target-muscle list; a
selected exercise opens a detail page with separate edit and delete actions.
Exercises own their strength/cardio type, muscle roles, instructions, and
uploaded image.

### IndexedDB stores

The initial client database should expose repositories rather than raw storage
calls throughout the UI. Proposed logical stores are:

| Store       | Contents                                      |
| ----------- | --------------------------------------------- |
| `workouts`  | Active and locally retained workout sessions  |
| `outbox`    | Ordered, retryable synchronization operations |
| `exercises` | Read-only cached exercise catalogue           |
| `muscles`   | Read-only cached muscle catalogue             |
| `templates` | Read-only cached template snapshots           |
| `metadata`  | Sync cursor and device-local ISO-week swaps   |

IndexedDB schema upgrades must be versioned and tested with data from the
previous supported version.

### Local write path

Workout actions update IndexedDB first. The UI observes the local result, so
logging does not wait for a network response. The same transaction appends or
updates an outbox record; a local change must never exist without the operation
needed to synchronize it.

When online, the synchronization worker drains the outbox in order. It retries
transient failures with backoff and removes an operation only after the server
has acknowledged it. Authentication and validation failures require user
attention and are not retried indefinitely.

Outbox records have a durable, monotonically increasing local sequence. React
workout mutations apply immediately against the latest local snapshot and enter
a serialized IndexedDB persistence queue. The server ignores snapshots whose
`updatedAt` is equal to or older than its canonical row, preventing a delayed
operation from replacing a newer workout.

### Typed exercises and weekly templates

`exercises.exercise_type` is either `strength` or `cardio` and is copied into
each workout-exercise snapshot. Strength efforts use repetitions, weight, and
`kg`/`lb`; cardio efforts use duration seconds, distance, and `km`/`mi`. The
persistence model retains nullable columns for both measurement families so
migrations and historical reads remain straightforward, while the client shows
and writes only the fields valid for the snapshot type.

Template entries use ISO weekday numbers (`1` Monday through `7` Sunday) plus a
position that is unique within that day. A weekly template can contain multiple
entries on every day. SQLite marks exactly one template active when any exist.
Creating a workout requires today's populated schedule in that active template;
the session stores the chosen template day and snapshots only that day's
entries. Legacy open-workout rows remain readable after migration, but the
client cannot create new ones.

The user may pairwise-swap today's assigned template day with another weekday
for the current ISO week. This permutation is stored in IndexedDB metadata,
keyed by active template and ISO week. It survives reloads and offline use but
does not mutate the reusable server template and naturally expires at the next
week key.

Each template day opens the same client-side exercise picker over the cached
exercise reference data. The picker filters locally by case-insensitive name or
associated muscle and renders uploaded demonstration images from their existing
media URLs; choosing an exercise only updates the template draft until the user
saves it through the online template API.

### Exercise images

Exercise images are uploaded as raw `image/gif`, `image/png`, or `image/jpeg`
bodies to a bounded endpoint. The server validates the five-MiB size limit,
declared MIME type, and matching file signature, stores immutable UUID-named
files with a format-specific extension beneath `MEDIA_PATH` (`/data/media` in
the container), and keeps metadata and exercise ownership in SQLite. An image
record belongs to at most one exercise. Deleting an exercise or replacing its
image removes both metadata and the file. The PWA prefetches referenced uploaded
images into a dedicated Workbox/Cache API cache; IndexedDB remains the source of
truth for exercise metadata and workout state. Website extraction is not
exposed by the API or client.

## Server application

The Express application is responsible for:

- parsing and validating requests against shared schemas;
- enforcing online-only catalogue and template mutations;
- applying idempotent workout synchronization operations;
- reading and writing SQLite through a small data-access layer;
- serving the production PWA; and
- exposing health and version information.

Suggested endpoint groups are:

```text
GET    /api/health
GET    /api/version
GET    /api/muscles
POST   /api/muscles
PATCH  /api/muscles/:id
DELETE /api/muscles/:id
GET    /api/exercises
POST   /api/exercises
PATCH  /api/exercises/:id
DELETE /api/exercises/:id
POST   /api/media/image
GET    /api/media/:id
DELETE /api/media/:id
GET    /api/templates
POST   /api/templates
PATCH  /api/templates/:id
DELETE /api/templates/:id
GET    /api/workouts
GET    /api/workouts/:id
POST   /api/sync
```

These are a starting contract, not a requirement to expose one route per table.
The synchronization endpoint should accept a bounded batch of operations and
return an acknowledgement or structured failure for each operation.

## Identifiers and idempotency

Domain records use UUIDs that can be generated in the browser. Each outbox
operation also has a unique operation ID. The server records processed
operation IDs, or otherwise enforces equivalent uniqueness, in the same
transaction as the requested write.

This guarantees that a timeout followed by a retry cannot duplicate a workout
or set. Database uniqueness constraints remain the final safeguard even when
request-level validation has already run.

## SQLite design

The initial relational model consists of:

```text
muscles
exercises
exercise_muscles
workout_templates
template_exercises
workout_sessions
workout_exercises
workout_sets
processed_operations
schema_migrations
```

Foreign keys are enabled for every connection. Transactions protect ordered
changes and synchronization batches. Migrations run before the HTTP server
reports readiness.

Historical workout rows store snapshots of mutable labels, exercise type,
template day, and targets needed for display. Foreign-key behavior must not
allow a catalogue deletion to erase workout history.

The production database path is configured through an environment variable and
defaults to `/data/spotter.sqlite`. The container documentation must call out
the required persistent volume and backup responsibility.
Uploaded media defaults to `/data/media`, so the same mounted volume protects
both canonical SQLite state and exercise demonstrations.

## API conventions

- JSON request and response bodies use explicit versioned schemas.
- Timestamps use ISO 8601 UTC strings on the wire.
- Validation failures return stable machine-readable error codes.
- Mutation responses return the canonical server representation.
- Collection synchronization uses a cursor or revision token instead of
  relying only on client timestamps.
- Payload and batch limits protect the service from accidental unbounded
  requests.

Authentication is not specified yet. Route handlers should receive any future
actor or ownership context through a boundary that can initially supply a
single local actor.

## Production image

The Dockerfile will use multiple stages:

1. install locked dependencies;
2. type-check, test as appropriate, and build the shared package, client, and
   server;
3. install or copy production-only server dependencies; and
4. copy the server output, PWA assets, and migrations into a minimal Node.js
   runtime image.

The runtime image should:

- run as a non-root user;
- expose one HTTP port;
- write application state only under `/data`;
- handle termination signals and close SQLite cleanly; and
- provide a health check that distinguishes liveness from migration or database
  readiness where practical.

## Continuous integration and releases

Validation and publication are separate workflows or jobs.

Spotter follows semantic versioning beginning at `0.1.0`. While the application
is under active development, releases use `0.MINOR.PATCH`: a minor release may
introduce breaking product, data, or API changes, while a patch release contains
compatible fixes. Version `1.0.0` will declare the first stable public contract.

Validation runs for pull requests and every branch push and performs:

- dependency installation from the lockfile;
- formatting and lint checks;
- TypeScript type-checking;
- unit and integration tests;
- a production application build; and
- a non-publishing Docker build.

Image publication is triggered by:

```yaml
on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
```

It uses GitHub's short-lived workflow token, grants only `contents: read` and
`packages: write`, builds with Docker Buildx, and publishes to
`ghcr.io/melvinmicallef/spotter`.

The broad `v*` trigger is guarded by a tested strict SemVer validator before
registry login or publication. The first release tag is `v0.1.0`; it produces
`0.1.0`, `0.1`, and `latest`, and exposes `0.1.0` (without `v`) through
`/api/version`. A prerelease such as `v0.2.0-beta.1` publishes only its exact
tag. A manual run uses a supplied tag or a unique `sha-<commit>` tag, never
moves release aliases, and receives a traceable application version such as
`0.1.0+sha.0123456789ab`.

## Testing strategy

The highest-value automated scenarios are:

- domain and validation unit tests;
- API integration tests against a temporary SQLite database;
- migration tests from each supported database version;
- IndexedDB repository and upgrade tests;
- synchronization retry and idempotency tests;
- a browser test that starts online, records and completes work offline,
  reloads, reconnects, and verifies one server-side workout; and
- a container smoke test using a temporary mounted data directory.

The Playwright browser suite runs the compiled PWA and Express API together on
an isolated temporary SQLite database. It verifies manifest metadata and
service-worker control, loads reference data online, reloads the cached shell
and active workout offline, finishes offline, then simulates a server-applied
sync request whose acknowledgement is lost. Reconnection must drain the
replayed outbox without duplicating the workout, exercise entry, or set.

## Observability and recovery

Server logs should be structured and include a request or operation ID without
logging workout notes or other unnecessary user content. Startup logs should
report the application version, database path, and migration status.

SQLite backup and restore instructions must be documented before the first
stable release. Backups should account for the selected journal mode rather
than copying an actively changing database file without coordination.

## Decisions to confirm during scaffolding

- Package manager and supported Node.js version.
- SQLite driver and migration library.
- IndexedDB wrapper or direct API usage.
- Authentication and deployment exposure expectations.
- Additional exercise types or measurements beyond the recorded strength and
  cardio baseline.
- Whether completed workouts can be edited offline.

## Recorded implementation decisions

The initial workspace uses npm 10 workspaces and supports Node.js 20.20 or
newer. Zod owns wire-format and environment validation. Vitest is the test
runner, while ESLint and Prettier provide linting and formatting. These choices
are intentionally conventional and can be upgraded without changing product
behavior.

The server uses `better-sqlite3` with small ordered migrations applied inside
transactions at startup. UUIDs are stored as canonical text, timestamps are ISO
8601 UTC text, foreign keys are enabled on every connection, and file-backed
databases use WAL mode. API errors use a stable `{ error: { code, message,
details? } }` envelope. The first migration establishes catalogue, template,
workout, outbox-idempotency, metadata, and migration tables.

The client uses `idb` over a versioned IndexedDB schema. A transaction stores
each local workout snapshot together with its outbox operation. The client
serializes outbox drains, retries transient failures with bounded exponential
backoff, and retains rejected operations for user-visible retry. Reference data
uses the server's monotonically increasing revision cursor.

Version `0.1.0` uses one active workout per device, one active weekly ISO-day
template, today-only starts with device-local current-week day swaps, strength
repetitions plus explicit `kg`/`lb` weight, cardio duration plus explicit
`km`/`mi` distance, and read-only completed workouts. It targets a trusted
single-user deployment without built-in authentication; the API layer remains
the boundary for adding actor and ownership context later.
