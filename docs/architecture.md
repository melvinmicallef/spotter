# Spotter Architecture

Status: Initial proposal

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

### IndexedDB stores

The initial client database should expose repositories rather than raw storage
calls throughout the UI. Proposed logical stores are:

| Store | Contents |
| --- | --- |
| `workouts` | Active and locally retained workout sessions |
| `outbox` | Ordered, retryable synchronization operations |
| `exercises` | Read-only cached exercise catalogue |
| `muscles` | Read-only cached muscle catalogue |
| `templates` | Read-only cached template snapshots |
| `metadata` | Schema version, sync cursor, and timestamps |

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

Historical workout rows should store snapshots of mutable labels or exercise
details needed for display. Foreign-key behavior must not allow a catalogue
deletion to erase workout history.

The production database path is configured through an environment variable and
defaults to `/data/spotter.sqlite`. The container documentation must call out
the required persistent volume and backup responsibility.

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

Validation runs for pull requests and ordinary pushes and performs:

- dependency installation from the lockfile;
- formatting and lint checks;
- TypeScript type-checking;
- unit and integration tests;
- a production application build; and
- optionally, a non-publishing Docker build.

Image publication runs on:

```yaml
on:
  push:
    tags:
      - "v*"
  workflow_dispatch:
```

It uses GitHub's short-lived workflow token, grants only `contents: read` and
`packages: write`, builds with Docker Buildx, and publishes to
`ghcr.io/melvinmicallef/spotter`.

The first release tag is `v0.1.0`. Its image metadata should produce `0.1.0`
and `0.1`; later semantic version tags follow the same scheme. `latest` may move
for a normal `0.x` release, but not for prerelease tags such as
`v0.2.0-beta.1`. A manual run should use a supplied tag or a unique
`sha-<commit>` tag so it cannot silently overwrite a release.

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
- Required unit system and non-repetition exercise measurements.
- Whether completed workouts can be edited offline.
