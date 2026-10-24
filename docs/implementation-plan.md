# Spotter Implementation Plan

Status: Approved build sequence. Dependency choices within milestones remain
implementation decisions until recorded.

## Guiding approach

Build Spotter as tested vertical slices. Establish the server, client, shared
schemas, and production serving path before expanding the domain. Add offline
behavior only after the corresponding online domain is explicit, but treat
local-first workout writes as a core design constraint rather than a later
enhancement.

Each milestone must leave the repository buildable and update documentation
with commands and decisions that now exist in code.

## Milestone 0: Workspace and executable skeleton (implemented)

### Deliverables

- Root TypeScript workspace with reproducible locked dependencies.
- `apps/web` React and TypeScript application built with Vite.
- `apps/server` Express and TypeScript application.
- `packages/shared` package for wire schemas and shared domain primitives.
- Environment configuration validation with safe development defaults.
- `GET /api/health` for liveness/readiness and `GET /api/version` for build
  metadata.
- Production server path that serves built web assets and the SPA navigation
  fallback while reserving `/api/*` for the API.
- Formatting, linting, type-checking, unit-test, and production-build scripts.
- CI validation for pull requests and pushes without image publication.

### Decisions to record

- Package manager and workspace mechanism.
- Supported Node.js version.
- Formatting and linting stack.
- Test runner.
- Runtime validation library.

### Exit gate

A clean checkout can install dependencies from the lockfile, run all checks,
build the web and server applications, start the production server, return a
healthy API response, and load the PWA shell.

## Milestone 1: SQLite foundation and reference catalogue (implemented)

### Deliverables

- SQLite connection management with foreign keys enabled.
- Ordered migration system and a migration command suitable for container
  startup.
- Initial tables for muscles, exercises, and exercise-to-muscle relationships.
- Shared request and response schemas.
- A read-only built-in hierarchical muscle catalogue plus online exercise CRUD,
  using separate muscle and exercise pages.
- Explicit strength, calisthenics, and cardio exercise types with
  type-appropriate fields.
- A compact exercise list and dedicated detail/editor flow, primary target
  muscle associations, separate preparation/execution
  instructions, optional comments, incremental leaf-muscle assignment,
  optional workout-visible reference links, and validated GIF/PNG/JPEG images.
- Dependency-safe deletion behavior that preserves future workout history.
- API integration tests using an isolated temporary database.

### Decisions to record

- SQLite driver and migration tool.
- Identifier representation and database timestamp representation.
- Initial exercise and muscle fields.
- Error envelope and stable validation codes.

### Exit gate

Exercises can be managed end to end while online, built-in muscles can be
browsed and assigned but not mutated, invalid requests have stable errors,
migrations work on a new database, and automated tests prove foreign-key and
deletion behavior.

## Milestone 2: Weekly workout templates (implemented)

### Deliverables

- Weekly template and per-day ordered template-exercise persistence.
- Exactly one active template when templates exist.
- Preserve when the active template was activated and show its age in days on
  Today; editing the active template leaves this timestamp unchanged.
- Online API and UI to create, rename, duplicate, edit, reorder, and delete
  templates.
- Multiple exercises on each ISO weekday.
- Type-appropriate initial targets and optional weekday titles.
- Swap full exercise lists between weekdays, preserving targets and moving
  optional day titles with their exercises, including swaps with rest days.
- Template read model suitable for caching and workout snapshot creation.
- Tests for ordering, duplication, validation, and deletion dependencies.

### Exit gate

A user can build and maintain a reusable seven-day workout template online,
and a template response contains everything needed to create an independent
snapshot for any populated day.

## Milestone 3: Online workout vertical slice (implemented)

### Deliverables

- Workout session, workout exercise, and workout set persistence.
- Start from any unfinished day in the active weekly template, with today
  selected by default and direct weekday selection.
- Mark a template day complete on workout finish and keep it greyed out for the
  rest of the local ISO week; reset at Monday midnight.
- Cancel a workout after confirmation without consuming the day, including
  deleting any synchronized in-progress snapshot through an outbox tombstone.
- Resume an in-progress workout.
- Add, remove, and reorder workout exercises.
- Mark and collapse completed exercises, with an option to reopen them.
- Add, edit, and remove sets.
- Display strength weight/repetition values in a compact grid with per-exercise
  controls to add or remove sets.
- Record strength repetitions/weight, calisthenics repetitions without weight,
  or cardio duration with optional distance. Cardio templates select duration
  or interval mode; intervals record work duration without distance. Interval
  timing is configured per workout, prefilled from the latest completed
  interval execution of the same exercise across templates, and adjustable
  before the timer starts. The timer provides countdown and stage-transition
  beeps, can skip the active stage, and records the resulting work duration in
  history. It shows the planned total duration next to the start control.
- Open the exercise guide, including its demonstration and instructions, from
  the active workout in a modal.
- Upload one persistent stretching poster in Settings and open its uncropped
  view from Today; cache the media response after it loads for offline viewing.
- Finish a workout and view history.
- Show date, template/day, and exercise count in compact history cards; retain
  exercise names in completed-workout details. Edit strength and calisthenics
  sets in compact side-by-side columns matching the active workout layout.
- Edit historical set counts and measurements online without changing the
  workout's exercise entries or order. Edit interval settings and total work
  time without presenting interval results as sets.
- Show dated Epley estimated one-rep max and total training volume charts on
  weighted strength exercise details.
- Historical display remains valid after catalogue or template changes.

### Decisions to record

- Single or multiple active workouts.
- Launch measurement types and unit behavior.
- Completed-history edits are online-only and cannot change exercise entries or
  their order. Interval history edits use interval settings and a single total
  work-time result instead of set controls.

### Exit gate

The complete workout lifecycle functions online with server-backed history,
fixed-roster completed-workout edits, strength progress charts, and snapshot-safe
historical display.

## Milestone 4: IndexedDB and offline workout tracking (implemented)

### Deliverables

- Versioned IndexedDB schema and repository layer.
- Stores for workouts, outbox operations, cached exercises, cached muscles,
  cached templates, and synchronization metadata.
- Local-first workout command layer: IndexedDB is updated before UI success.
- Persist typed workout values and exercise completion in the local workout
  snapshot and synchronization outbox as each change is made.
- Atomic local workout mutation and outbox write.
- Client-generated UUIDs for offline-created records and operations.
- Connectivity and synchronization status UI.
- Refresh, close, and reopen recovery for an in-progress workout.
- Online-only controls for catalogue and template mutations are disabled with a
  clear explanation while offline.

### Exit gate

After one online load, a browser can go offline, start or resume a workout,
record and edit sets, finish the workout, refresh or restart the PWA, and retain
all local state.

## Milestone 5: Idempotent synchronization (implemented)

### Deliverables

- Bounded synchronization batch contract in `packages/shared`.
- Server transaction that applies an operation and records its unique operation
  ID atomically.
- Duplicate operation acknowledgement without duplicate domain writes.
- Ordered outbox draining and removal only after acknowledgement.
- Retry classification: transient failures retry with backoff; validation or
  authorization failures remain visible and require attention.
- Reference-data pull using a server cursor or revision token rather than only
  client clocks.
- Recovery behavior for interrupted requests and ambiguous timeouts.
- Automated tests for replay, retry, partial batch failure, reload, and
  reconnect.

### Exit gate

An end-to-end browser test starts online, works offline, reloads, reconnects,
retries at least one ambiguous request, and proves that exactly one workout and
one copy of each set exist on the server.

## Milestone 6: Installable PWA and update safety (implemented)

### Deliverables

- Web manifest, icons, installability metadata, and service worker.
- Application-shell and static-asset caching separated from IndexedDB data.
- Predictable update prompt or activation flow.
- Update behavior that cannot discard or strand an active workout.
- Offline navigation and reload behavior for application routes.
- Browser tests for installation prerequisites, offline application loading,
  and service-worker upgrade behavior.

### Exit gate

Spotter passes the selected installability checks, reloads its UI without a
network connection, and upgrades without losing an active workout or outbox.

## Milestone 7: Single production image (implemented)

### Deliverables

- Multi-stage Dockerfile for dependencies, builds, and minimal runtime.
- Non-root runtime user.
- One exposed HTTP port and graceful shutdown.
- SQLite database path defaulting to `/data/spotter.sqlite`.
- Startup migration behavior and readiness handling.
- Container health check.
- Example run command or Compose file showing the persistent host directory
  bind-mounted at `/data`.
- Container smoke test that proves data survives container replacement.
- Backup and restore documentation appropriate to the selected SQLite journal
  mode.

### Exit gate

One image starts with an empty volume, migrates the database, serves the API and
PWA, reports healthy, preserves data across replacement, and shuts down cleanly.

## Milestone 8: Release automation and `0.2.0` (implemented and released)

### Deliverables

- Validation workflow for pull requests and normal pushes.
- Reusable image workflow called by a dependent job after successful
  validation of pushed `v*` tags, with an independently validated
  `workflow_dispatch` path.
- Minimal workflow permissions: `contents: read` and `packages: write` for the
  publishing job.
- Docker Buildx build and GHCR authentication using the workflow token.
- Semantic image metadata for normal and prerelease tags.
- Manual image tag input with a safe `sha-<commit>` fallback.
- Confirmation that ordinary commits never publish an image.
- Release checklist and changelog or release-note process.
- Playwright browser tests run in the validation workflow for branch, pull
  request, and tag changes. Tag publication waits for that validation to pass;
  manual release dispatch runs the same checks before publishing.

### Exit gate

All `0.2.0` acceptance criteria pass. A deliberate `v0.2.0` tag builds and
publishes the expected versioned image to `ghcr.io/melvinmicallef/spotter`,
while a normal commit and pull request only run validation.

The automation, strict tag validation, normalized application versioning, and
published `v0.2.0` image are complete.

## Milestone 9: Stable `1.0.0` release

The stable contract covers the documented trusted, single-user deployment and
the offline workout, online catalogue, template, and history flows. The
pre-user SQLite schema and IndexedDB namespace reset form the new migration
baseline. Authentication, multi-user tenancy, additional measurement types,
and data export/retention remain explicit future decisions.

Before tagging, update versions and release notes, run the full check and
Playwright suites, build and smoke-test the production container with a mounted
volume, verify backup and restore, and complete mobile and accessibility QA.
Document the required data reset for users of `0.1.0` or `0.2.0`.

## Required test matrix

| Area             | Minimum coverage                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Shared contracts | Valid and invalid wire payloads; backward-compatible parsing where promised               |
| SQLite           | Fresh migration, upgrade migration, foreign keys, uniqueness, transactions                |
| Catalogue        | CRUD, list/detail flow, primary muscle associations, images, dependencies, validation     |
| Templates        | Ordering, duplication, snapshots, changed/deleted references                              |
| Workout domain   | Lifecycle, ordering, set edits, completion, history snapshots, fixed-roster history edits |
| IndexedDB        | Repository operations, version upgrades, atomic workout/outbox writes                     |
| Synchronization  | Duplicate replay, retry, partial failures, interrupted acknowledgement                    |
| PWA              | Offline shell, route reload, update with active workout                                   |
| Container        | Startup, health, migrations, persistent volume, graceful stop                             |
| Workflows        | Normal commit does not publish; tag/manual run produces intended tags                     |

The browser-level paths run in Playwright from `tests/e2e`, separately from the
fast Vitest suite with `npm run test:e2e`. They cover installation metadata,
service-worker shell caching, offline IndexedDB recovery and exactly-once
synchronization, catalogue and template CRUD, exercise guide/comments and media,
confirmation dialogs, typed strength/calisthenics/cardio inputs, interval timer
beeps and refresh recovery, previous-value placeholders, measurement and theme
preferences, stretching-poster caching and deletion, history details and edits,
and strength progress charts. CI installs
Chromium for these runs. Tag releases call the publishing workflow only after
the tag's validation job succeeds; manual dispatch runs browser tests itself.

## Release documentation

- Installation and upgrade instructions.
- Runtime environment variable reference.
- Persistent host directory and permissions guidance.
- SQLite backup and restore procedure.
- Offline behavior and synchronization-status explanation for users.
- Release process and image-tag policy.
- Known limitations, including unsupported simultaneous multi-device editing.
- Decisions or explicit deferrals for every open product question that blocks
  the target release.
