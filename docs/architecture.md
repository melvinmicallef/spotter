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

## Repository layout

```text
apps/
  server/src/
    features/      HTTP routes grouped by catalogue, media, settings,
                   templates, reference data, workouts, and synchronization
    persistence/   SQLite migrations and canonical store
    integration/   Cross-feature API tests
    app.ts          Express assembly and static PWA serving
  web/src/
    app/           Application state and view composition
    features/      Catalogue, history, offline storage and sync, settings,
                   templates, and workouts; unit tests beside each feature
    shared/        API client, routing, and weekday helpers
    components/    Shared dialogs and PWA update prompt
packages/
  shared/          Domain types, API contracts, and validation schemas
tests/e2e/        Browser tests grouped by feature
design/           Selected runner icon source artwork
docs/              Product and architecture documentation
.github/workflows/ Validation and image-publishing workflows
Dockerfile         Multi-stage production image
package.json       Workspace scripts and shared tool configuration
```

The web and server applications share wire-format schemas from `packages/shared`
but do not share persistence-specific models. This keeps browser storage and
SQLite implementation details from leaking into the API contract.
The server's feature routers preserve the public `/api/*` paths while SQLite
access remains in one persistence layer. The runner source artwork is kept in
`design/runner-concept.png`; only its production PNG sizes live in the web
application's public assets.

## Client application

### React PWA

The client is a React and TypeScript application built with Vite. A PWA plugin
will generate the web manifest and service worker.

The service worker owns application-shell and static-asset caching. It must not
be treated as the source of truth for workout data; that belongs in IndexedDB.
Separating these concerns makes service-worker upgrades safer and keeps workout
records queryable by application code.

The PWA manifest provides standalone display, a root start URL and scope,
192px and 512px PNG runner icons derived from the selected concept image with
transparent rounded corners, and a separate full-bleed maskable Android PNG.
The green runner also appears in the favicon and app header. The client
captures Chromium's install prompt when the browser exposes it. Production
deployments opened on another device must use HTTPS for browser installation;
localhost is suitable only when the browser is on the same development device.
The manifest link requests same-origin credentials so an authenticating reverse
proxy, such as Cloudflare Access, can serve the manifest after login.

The light/dark appearance choice is a device-only preference stored in
`localStorage`, separate from workout and synchronization state. A small inline
bootstrap in the HTML applies the saved theme (or the operating-system
preference when unset) before React and the stylesheet render, avoiding an
incorrect-theme flash. Theme changes also update the browser theme-color
metadata.

After an in-flight reference refresh completes, connectivity is reconciled
against the browser's current `navigator.onLine` value. A response begun while
online can still finish after an offline event; successful data reads must not
then re-enable online-only controls. This changes only connection presentation
and action availability, not local workout persistence or outbox handling.

Each primary view has a stable client-side route: `/workout`, `/history`,
`/muscles`, `/exercises`, `/templates`, `/settings`, and `/stretching`.
Navigation writes browser history, back/forward navigation restores the
corresponding view, and Express plus the service-worker navigation fallback
both return the PWA shell for a direct load or refresh on those paths. The
Today view links to the stretching poster page. Exercise creation, details,
and editing also have stable nested routes: `/exercises/new`, `/exercises/:id`, and
`/exercises/:id/edit`. Weekly templates follow the same list/detail/editor
pattern at `/templates/new`, `/templates/:id`, and `/templates/:id/edit`.

App forms and editable controls request `autocomplete="off"` to discourage
browser profile, address, payment, and previously entered values from appearing
in exercise, template, or workout fields. This is a browser hint: Android's
keyboard and autofill service can still show their own suggestions.

The catalogue has separate muscle and exercise views. The muscle view renders a
read-only built-in hierarchy sourced from the ExRx directory: only leaf records
are selectable, while group and subgroup headings are navigation metadata.
Exercises use a compact image/title/target-muscle list; a selected exercise
opens a detail page with separate edit and delete actions. Deletion requires an
explicit confirmation before the online request is sent. Muscle source links
open ExRx in a new browser tab so the catalogue remains available.
Exercises own their strength/calisthenics/cardio category, primary target muscles,
separate preparation and execution instructions, optional comments, and
uploaded image. A server-managed application setting points to the single
stretching-poster image. The image is shared across devices and is stored using
the existing media storage path; a device caches its media response after it
loads so the poster can be viewed offline. The presentation and measurement
system preferences remain device-local.

The exercise editor assigns muscles incrementally rather than rendering the
entire catalogue. All assignments are primary targets; duplicate assignments
are excluded and there are no role selectors. An exercise can also store a manually entered,
validated HTTP/HTTPS reference URL. That URL is copied through template read
models into the workout-exercise snapshot and remains in locally persisted
workout data. Active workout cards and their guide modal hide references;
Exercise Library details continue to display them.

### IndexedDB stores

The initial client database should expose repositories rather than raw storage
calls throughout the UI. Proposed logical stores are:

| Store       | Contents                                             |
| ----------- | ---------------------------------------------------- |
| `workouts`  | Active and locally retained workout sessions         |
| `outbox`    | Ordered, retryable synchronization operations        |
| `exercises` | Read-only cached exercise catalogue                  |
| `muscles`   | Read-only cached muscle catalogue                    |
| `templates` | Read-only cached template snapshots                  |
| `metadata`  | Sync cursor and device-local completed ISO-week days |

IndexedDB schema upgrades must be versioned and tested with data from the
previous supported version.

The pre-user reset started the browser at version one of the `spotter-v2`
IndexedDB database. Version two removes secondary muscle links from cached
exercises and invalidates the reference revision so the next online refresh
reloads the catalogue. Workouts, templates, progress markers, and the outbox
are preserved, including when upgrading offline. The earlier `spotter`
namespace is not read. Future migrations increment the version within
`spotter-v2` and preserve its workouts and outbox.

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

Each workout-exercise snapshot copies its `strength`, `calisthenics`, or
`cardio` category. Strength efforts use repetitions, optional weight, and
`kg`/`lb`; calisthenics efforts use repetitions without weight; duration cardio
uses one duration result with optional distance, while interval cardio records
work duration without distance. Templates select duration or interval mode;
interval timing is configured on each workout and stored only in its
workout-exercise snapshot.
Starting an interval workout uses the latest completed interval execution for
that exercise, across templates, or defaults to 0 prep seconds, 30 work
seconds, 30 rest seconds, and 8 iterations. Users can adjust those values
before starting the timer. The interval timer runs prep, work, and rest stages,
can skip the active stage, beeps for countdown values five through one and at
stage transitions, and records work duration, subtracting work skipped early.
History shows the interval settings and recorded work duration without a
distance field. A device-local Metric/Imperial Settings preference controls
weight entry and display, and duration-cardio distance uses `km`/`mi` derived
from that preference. Saved weighted values retain their recorded unit.
The browser keeps a small numeric interval-timer checkpoint keyed by workout
exercise so a running or paused timer can resume after a refresh on that device.
The finished duration is written through the normal IndexedDB workout and
outbox path; the checkpoint is temporary interface state, not workout storage.
The persistence model retains nullable columns for both measurement families so
migrations and historical reads remain straightforward, while the client shows
and writes only the fields valid for the snapshot type.

SQLite stores the same `strength`, `calisthenics`, and `cardio` category as the
API. Its clean baseline has no legacy strength/cardio compatibility column.

Template entries use ISO weekday numbers (`1` Monday through `7` Sunday) plus a
position that is unique within that day. A weekly template can contain multiple
entries on every day and one optional display name for each weekday. SQLite
marks exactly one template active when any exist.
The current weekday is selected by default, and the user can select any
unfinished weekday directly. A new workout snapshots the selected day and its
entries; legacy open-workout rows remain readable, but the client cannot create
new ones. Finishing a workout atomically saves its completed state and marks the
template day complete in IndexedDB metadata, keyed by template and ISO week.
The day remains unavailable through reloads and offline use until the local
week changes at Monday midnight. Cancelling a workout removes its local state
and queues an idempotent delete operation so a previously synchronized draft
is also removed without consuming the day.

Each template stores `active_since` as an ISO UTC timestamp while it is active.
Activating another template clears the prior timestamp and starts a new one;
editing the active template preserves it. Deleting the active template starts
the timestamp for the automatically promoted template. The Today view derives
an elapsed local-calendar-day count from that timestamp. The migration that
introduces this field starts the count for an existing active template when the
upgrade runs because older databases did not record when activation happened.

Each template day opens the same client-side exercise picker over the cached
exercise reference data. The picker filters locally by case-insensitive name or
associated muscle and renders uploaded demonstration images from their existing
media URLs. The picker shares full muscle-path formatting with the Exercise
Library. Its sticky header contains Done for multi-select template editing;
choosing an exercise only updates the template draft until the user saves it
through the online template API. In an active workout the picker uses single
selection, guards against repeated selection events, and closes immediately
after adding one entry through the normal local workout command.

The template editor can swap the full exercise lists between any two weekdays,
including a rest day. Each exercise's targets and optional day names move with
its weekday assignment in the draft; the existing template update API persists
the saved draft as one operation.

The template catalogue is a compact list. Selecting a template opens a
read-only weekly-plan detail page; editing and deletion are explicit actions on
that page, and the full weekly editor is isolated on its own route.

### Exercise images

Exercise images are uploaded as raw `image/gif`, `image/png`, or `image/jpeg`
bodies to a bounded endpoint. The server validates the five-MiB size limit,
declared MIME type, and matching file signature, stores immutable UUID-named
files with a format-specific extension beneath `MEDIA_PATH` (`/data/media` in
the container), and keeps metadata and references in SQLite. An image can be
referenced by an exercise or by the single stretching-poster setting. Deleting
an exercise or replacing a reference removes media metadata and the file only
when no exercise or setting still references it. The PWA prefetches referenced
uploaded images into a dedicated Workbox/Cache API cache; IndexedDB remains the
source of truth for exercise metadata and workout state. Website extraction is
not exposed by the API or client.

Viewport-controlled GIF playback was evaluated for this UI update and is not
implemented. The existing lists use native `img` elements, whose
[HTMLImageElement API](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement)
does not provide animation pause/resume controls. CSS hiding or removing an
element is not a reliable pause mechanism for a cached animated image.
Native lazy loading only defers loading; it does not control playback after
loading. Reference synchronization already prefetches media for offline use,
so lazy loading alone would not remove that network cost. A reliable solution
would need additional static posters/frame capture or a different animation
format with playback controls. Those approaches add memory, processing, and
scroll-time swapping complexity without an established performance bottleneck
or measured significant benefit in the current application. Keep native GIF
behavior until profiling on representative mobile devices justifies that work.

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
GET    /api/settings
PUT    /api/settings
GET    /api/muscles
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
DELETE /api/workouts/:id
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
template_day_names
app_settings
workout_sessions
workout_exercises
workout_sets
processed_operations
schema_migrations
```

Foreign keys are enabled for every connection. Transactions protect ordered
changes and synchronization batches. Migrations run before the HTTP server
reports readiness.

The pre-user database was reset to one version-one `baseline` migration. It
creates the full current schema directly; migrations from published `0.1.0`
or `0.2.0` databases are intentionally unsupported. Development installations
using those schemas must stop the server, remove the SQLite file and its WAL
sidecars, and clear the browser's site data before starting this baseline.
From this baseline onward, migrations are append-only. Versions and names form
a contiguous, immutable history. Startup rejects a database whose recorded
migration differs from the application or is newer than the application,
rather than running against an unknown schema. Each migration runs in a
transaction. Future table rebuilds that require temporarily disabling foreign
keys must do so before the transaction, run `foreign_key_check` before commit,
and restore enforcement even on failure.

Migration two, `primary_muscles_only`, rebuilds `exercise_muscles` with only
`exercise_id` and `muscle_id`, retaining primary links and deleting secondary
links. It removes the role column and preserves both foreign keys, the
composite primary key, and the muscle index. It increments the reference
revision once so connected devices refresh their cached catalogue. The
unchanged baseline migration remains in the history. The 1.x wire format keeps
`role: 'primary'` for compatibility; legacy secondary links are discarded at
the input/response boundary, and omitted roles default to primary. No secondary
assignments can be persisted through the API. Workout snapshots do not store
muscle assignments and are unchanged.

### Agreed secondary-muscle removal for 1.2.0

- Decision status: agreed.
- Owner instruction: "Remove the secondary muscle feature from everywhere. Db
  as well" and "when the v1.2.0 starts it will clear and drop second muscles".
  The owner subsequently requested the next minor tag and release.
- Target release: `1.2.0`.
- Affected data: SQLite secondary links and the role column, cached exercise
  muscle links in IndexedDB, and secondary assignments sent by older clients.
- Preserved data: primary links, exercise records and media, templates, workout
  snapshots and history, progress markers, and pending synchronization.
- Treatment and compatibility: append migration two on server startup; upgrade
  the browser cache to version two even offline. Retain `role: 'primary'` on
  the 1.x wire format and ignore secondary input as explicitly requested.
- Recovery: back up `/data` before upgrading. Deleted assignments require that
  backup to recover; do not run 1.1.0 on the migrated database. Keep browser site
  data because a server backup does not contain unsynchronized local workouts.
- Verification: fresh and repeat-start migration tests, foreign-key/uniqueness
  checks, API compatibility tests, cache-upgrade tests preserving workouts and
  outbox, and Docker volume backup/restore and restart smoke checks.

The final schema uses each parent/position uniqueness constraint as the index
for ordered template entries, workout exercises, and sets. Separate indexes
cover workout-history ordering and nullable catalogue/template foreign keys
used during deletion. Processed operation IDs remain unique and are retained
indefinitely because sync retries have no bounded lifetime in the current
contract.

The server seeds 45 stable built-in leaf muscles at startup. Muscle rows retain
their ExRx group, optional subgroup, source URL, and display order. The API
exposes them read-only; there are no muscle mutation routes.

Historical workout rows store snapshots of mutable labels, exercise type,
template day and its optional name, and targets needed for display. Foreign-key
behavior must not allow a catalogue deletion to erase workout history.
Each workout exercise also stores a completion flag so an in-progress exercise
can be collapsed and remain collapsed after the workout is reopened. This state
is included in the local workout/outbox snapshot and synchronized to SQLite.

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
- Deleting a completed workout is idempotent: an already-absent server row is
  treated as deleted, allowing the client to remove a stale cached history
  copy. An existing in-progress workout still cannot be deleted from history.
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

Spotter follows semantic versioning beginning at `0.1.0`. Version `1.0.0`
declares the first stable public contract for trusted, single-user
deployments. Future incompatible product, data, or API changes require a major
version.

Validation runs for pull requests and every branch push and performs:

- dependency installation from the lockfile;
- formatting and lint checks;
- TypeScript type-checking;
- unit and integration tests;
- a production application build; and
- a non-publishing Docker build.

Pushed `v*` tags also run the same validation workflow. Its dependent
publishing job calls the reusable release workflow only after the checks pass;
the publisher confirms the tag still points to the validated commit. A manual
release dispatch runs the checks within the release workflow before publishing.

The reusable publisher accepts only the validated tag and commit from its
caller. It uses GitHub's short-lived workflow token, grants only
`contents: read` and `packages: write`, builds with Docker Buildx, and publishes
to `ghcr.io/melvinmicallef/spotter`. A read-only preparation job validates
release metadata before the package-write job logs into GHCR. Buildx uses the
GitHub Actions cache without changing image contents or tags.

The broad `v*` trigger is guarded by a tested strict SemVer validator before
registry login or publication. The first release tag `v0.1.0` produced
`0.1.0`, `0.1`, and `latest`; the current `v1.3.1` release produces `1.3.1`,
`1.3`, and `latest`, and exposes `1.3.1` (without `v`) through `/api/version`.
A prerelease such as `v0.2.0-beta.1` publishes only its exact tag. A manual run
uses a supplied tag or a unique `sha-<commit>` tag, never moves release aliases,
and receives a traceable application version such as
`1.3.1+sha.0123456789ab`.

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
replayed outbox without duplicating the workout, exercise entry, or set. Other
browser scenarios exercise muscle and exercise browsing, image upload,
comments, in-app deletion confirmations, weekly template editing and day names,
typed strength/calisthenics/cardio entries, previous-set hints, interval timer
beeps and recovery, exercise-guide modals, Settings, and stretching-poster
upload, removal, and offline viewing. The validation workflow installs
Chromium; the tag publisher waits for its successful completion.

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
- Additional exercise types or measurements beyond the recorded strength,
  calisthenics, and cardio baseline.

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
each local workout snapshot together with its outbox operation; finishing also
stores its weekly completion marker in that transaction. Cancelling removes
pending upserts for the workout and queues an ordered delete tombstone. The
client serializes outbox drains, retries transient failures with bounded
exponential backoff, and retains rejected operations for user-visible retry.
Reference data uses the server's monotonically increasing revision cursor.

The current `1.3.1` implementation uses one active workout per device, one
active weekly ISO-day template, starts from any unfinished day with today
selected by default, per-device current-week completion markers, strength
repetitions plus explicit `kg`/`lb` weight, calisthenics
repetitions without weight, duration cardio with optional distance, and
interval timers that record work duration without distance. Metric is the
device-local default. Settings converts active entry and template target
displays while preserving recorded units in completed history. Completed
history supports online set-value and set-count edits for strength,
calisthenics, and duration cardio, plus interval setting and total-work edits,
only after pending outbox work has synchronized; exercise entries and their
order remain fixed. Strength exercise details graph Epley estimated one-rep max
and total training volume by workout date. Workout entries retain their progress locally, including
completion state and interval timer checkpoints. The deployment remains
trusted and single-user without built-in authentication; the API layer remains
the boundary for adding actor and ownership context later.
