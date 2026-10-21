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
- Online API and UI for creating, listing, editing, and deleting muscles and
  exercises.
- Role-aware primary and secondary muscle associations, validated GIF media,
  and review-before-create website metadata import with SSRF protections.
- Dependency-safe deletion behavior that preserves future workout history.
- API integration tests using an isolated temporary database.

### Decisions to record

- SQLite driver and migration tool.
- Identifier representation and database timestamp representation.
- Initial exercise and muscle fields.
- Error envelope and stable validation codes.

### Exit gate

Catalogue records can be managed end to end while online, invalid requests have
stable errors, migrations work on a new database, and automated tests prove
foreign-key and deletion behavior.

## Milestone 2: Workout templates (implemented)

### Deliverables

- Template and ordered template-exercise persistence.
- Online API and UI to create, rename, duplicate, edit, reorder, and delete
  templates.
- Exercise-level template notes or initial targets.
- Template read model suitable for caching and workout snapshot creation.
- Tests for ordering, duplication, validation, and deletion dependencies.

### Exit gate

A user can build and maintain a reusable ordered workout template online, and a
template response contains everything needed to create an independent workout
snapshot.

## Milestone 3: Online workout vertical slice (implemented)

### Deliverables

- Workout session, workout exercise, and workout set persistence.
- Start an empty workout or one based on a template snapshot.
- Resume an in-progress workout.
- Add, remove, and reorder workout exercises.
- Add, edit, complete, and remove sets.
- Record repetitions, weight, notes, and explicit unit semantics.
- Finish a workout and view history.
- Historical display remains valid after catalogue or template changes.

### Decisions to record

- Single or multiple active workouts.
- Launch measurement types and unit behavior.
- Whether a completed workout can be edited online.

### Exit gate

The complete workout lifecycle functions online with server-backed history and
snapshot-safe historical display.

## Milestone 4: IndexedDB and offline workout tracking (implemented)

### Deliverables

- Versioned IndexedDB schema and repository layer.
- Stores for workouts, outbox operations, cached exercises, cached muscles,
  cached templates, and synchronization metadata.
- Local-first workout command layer: IndexedDB is updated before UI success.
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
- Example run command or Compose file showing the persistent `/data` volume.
- Container smoke test that proves data survives container replacement.
- Backup and restore documentation appropriate to the selected SQLite journal
  mode.

### Exit gate

One image starts with an empty volume, migrates the database, serves the API and
PWA, reports healthy, preserves data across replacement, and shuts down cleanly.

## Milestone 8: Release automation and `0.1.0` (automation implemented; release candidate pending)

### Deliverables

- Validation workflow for pull requests and normal pushes.
- Separate image workflow triggered only by pushed `v*` tags and
  `workflow_dispatch`.
- Minimal workflow permissions: `contents: read` and `packages: write` for the
  publishing job.
- Docker Buildx build and GHCR authentication using the workflow token.
- Semantic image metadata for normal and prerelease tags.
- Manual image tag input with a safe `sha-<commit>` fallback.
- Confirmation that ordinary commits never publish an image.
- Release checklist and changelog or release-note process.

### Exit gate

All initial product acceptance criteria pass. A deliberate `v0.1.0` tag builds
and publishes the expected versioned image to
`ghcr.io/melvinmicallef/spotter`, while a normal commit and pull request only
run validation.

The automation, strict tag validation, normalized application versioning,
release checklist, and changelog process are implemented. The milestone is not
complete: `v0.1.0` must not be created until the full acceptance criteria and
required test matrix pass, and no published image has yet been verified.

## Required test matrix

| Area             | Minimum coverage                                                               |
| ---------------- | ------------------------------------------------------------------------------ |
| Shared contracts | Valid and invalid wire payloads; backward-compatible parsing where promised    |
| SQLite           | Fresh migration, upgrade migration, foreign keys, uniqueness, transactions     |
| Catalogue        | CRUD, role-aware associations, media/import, deletion dependencies, validation |
| Templates        | Ordering, duplication, snapshots, changed/deleted references                   |
| Workout domain   | Lifecycle, ordering, set edits, completion, history snapshots                  |
| IndexedDB        | Repository operations, version upgrades, atomic workout/outbox writes          |
| Synchronization  | Duplicate replay, retry, partial failures, interrupted acknowledgement         |
| PWA              | Offline shell, route reload, update with active workout                        |
| Container        | Startup, health, migrations, persistent volume, graceful stop                  |
| Workflows        | Normal commit does not publish; tag/manual run produces intended tags          |

The browser-level PWA paths are automated in `tests/e2e`. They exercise
installation metadata, service-worker shell caching, IndexedDB recovery after
an offline navigation, offline workout completion, an ambiguous synchronization
acknowledgement, exactly-once server persistence, role-aware catalogue edits,
reviewed website import, GIF upload and offline caching, note inputs, and
detailed history. They run separately from the fast Vitest suite with
`npm run test:e2e`; CI installs Chromium before invoking it.

## Documentation required before `v0.1.0`

- Installation and upgrade instructions.
- Runtime environment variable reference.
- Persistent volume and permissions guidance.
- SQLite backup and restore procedure.
- Offline behavior and synchronization-status explanation for users.
- Release process and image-tag policy.
- Known limitations, including unsupported simultaneous multi-device editing.
- Decisions or explicit deferrals for every open product question that blocks
  the first release.
