# Spotter Project Context and AI Handoff

Status: Durable handoff for contributors and new AI chats

## Why this document exists

Spotter was initially specified through a planning conversation. This document
captures the agreed outcome so future work does not depend on access to that
conversation. It separates settled requirements from proposed details and open
questions.

## Current state

The repository is public at `https://github.com/melvinmicallef/spotter`.

- Default branch: `develop`
- Application status: working 0.x application; catalogue and template
  management, typed and offline workouts, synchronization, PWA packaging,
  container delivery, and CI/release automation are present
- First release: `0.1.0` (`v0.1.0`)
- Current release: `0.2.0` (`v0.2.0`)
- Planned image: `ghcr.io/melvinmicallef/spotter`
- Current documents: product specification, architecture, implementation plan,
  this handoff, and repository agent instructions

## Product in one paragraph

Spotter is a self-hosted workout tracker designed primarily for phone use at
the gym. It is an installable React and TypeScript PWA backed by an Express and
TypeScript API with SQLite persistence. Workout logging is local-first: after
the application and reference data have been loaded, a user can continue an
active workout without connectivity and synchronize it later. Exercise and
workout-template changes are intentionally online-only. The muscle catalogue is
a built-in, read-only hierarchy. The complete application ships as one Docker
image.

## Settled decisions

These requirements have been explicitly agreed and should be treated as the
baseline.

| Area                   | Decision                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Client                 | React with TypeScript                                                                                |
| Distribution           | Installable progressive web application                                                              |
| Server                 | Express with TypeScript                                                                              |
| Canonical database     | SQLite                                                                                               |
| Offline database       | IndexedDB                                                                                            |
| Offline writes         | Active workout tracking, including starting, resuming, recording, and finishing                      |
| Offline reference data | Cached read-only muscles, exercises, and templates needed to log a workout                           |
| Completed history      | Online set-value and set-count edits; exercise entries and snapshots remain fixed                    |
| Online-only writes     | Creating, editing, reordering, or deleting exercises and templates                                   |
| Muscle catalogue       | Built-in ExRx leaf muscles grouped under non-selectable parent headings                              |
| Synchronization        | Durable outbox, client-generated IDs, idempotent server application, automatic retry after reconnect |
| Production topology    | One Docker image and one application process                                                         |
| HTTP serving           | Express serves both `/api/*` and the compiled PWA                                                    |
| Persistent path        | SQLite and related files under `/data`                                                               |
| Image registry         | `ghcr.io/melvinmicallef/spotter`                                                                     |
| Image triggers         | `v*` tags after successful validation; optional validated manual workflow dispatch                   |
| Ordinary CI            | Validate commits and pull requests without publishing an image                                       |
| Default branch         | `develop`                                                                                            |
| Versioning             | Semantic versioning beginning at `0.1.0`; remain on `0.x` during active development                  |

## Required user experience

The most important flow is recording a workout reliably in a gym with unstable
connectivity.

1. The user loads or installs Spotter while online.
2. The client synchronizes the muscle catalogue, typed exercise catalogue, and
   weekly workout templates, exactly one of which is active when any exist.
   Today shows how many local calendar days the active template has been in use.
3. The current weekday is selected by default. The user can select any other
   unfinished day directly from the cached active weekly template. Finished
   days stay marked until local Monday midnight, but can be selected again
   after confirmation to repeat their workout; cancelling a workout leaves its
   day available. Open or empty workouts cannot be created.
4. Every workout change is committed to IndexedDB before the UI considers it
   saved.
5. The user may lose connectivity, refresh the page, close the PWA, reopen it,
   resume the same workout, record sets, and finish it.
6. Each local write has a corresponding durable synchronization operation.
7. After reconnecting, Spotter retries pending operations without creating
   duplicate workouts or sets.
8. The synchronized workout appears in server-backed history.

The interface must communicate offline state, pending synchronization, and
failed synchronization. An error must preserve local workout data and provide a
safe retry path.

## Data ownership and invariants

- SQLite is the canonical long-term store.
- IndexedDB is authoritative for unsynchronized local workout activity until
  the server acknowledges it.
- The service worker caches the application shell and static assets; it is not
  the workout database.
- Offline-created domain records and outbox operations have client-generated
  UUIDs.
- Saving a local workout change and queuing its synchronization operation occur
  in one IndexedDB transaction.
- Replaying an acknowledged operation must not create another record.
- SQLite uniqueness constraints are the final defense against duplication.
- A workout created from a template stores enough snapshot data to remain
  understandable after the template or catalogue changes.
- Deleting catalogue records must not erase or corrupt workout history.
- Wire timestamps are ISO 8601 UTC; presentation uses the device's timezone.
- Weight values cannot be reinterpreted when the display unit changes; units
  must be stored or values normalized with an explicit convention.

## Delivery and release behavior

The production Dockerfile will be multi-stage. It builds the shared TypeScript
contracts, React client, and Express server, then creates a minimal runtime that
runs as a non-root user. Express serves the compiled client and API from the
same process. Runtime state is written only beneath `/data`.

Routine validation includes formatting, linting, type-checking, automated
tests, a production application build, and a non-publishing Docker build for
every branch push and pull request. Pushed `v*` tags run the same validation
workflow; a dependent job calls the publisher only after validation succeeds
and confirms the tag still references the validated commit. Manual dispatch
runs the same checks before publishing.

The first release `v0.1.0` and current release `v0.2.0` are published. A stable
semantic-version tag publishes exact, minor, and `latest`
image tags. A prerelease such as `v0.2.0-beta.1` publishes only its exact tag.
A manually dispatched build uses an explicit tag or a collision-safe
`sha-<commit>` tag and never moves release aliases. Tag and manual builds expose
a normalized, traceable version through `/api/version`. The checklist and
release-note process are in `docs/releasing.md`.

## Explicitly not finalized

Do not infer answers to these questions from the rest of the architecture:

- history export and retention requirements;
- account and tenancy behavior after the trusted single-user `0.1.x` line;
- measurement types beyond strength, calisthenics, and cardio.

The architecture intentionally leaves boundaries where these decisions can be
introduced without replacing the workout model or synchronization core.

## What not to do

- Do not make workout logging depend on a successful server round trip.
- Do not allow offline catalogue or template mutations in the initial release.
- Do not use service-worker cache entries as durable workout state.
- Do not publish a container image on every commit.
- Do not require separate frontend, backend, and database containers for the
  initial production deployment.
- Do not silently choose product behavior for an explicitly open question.
- Do not create a release tag until the acceptance criteria and required tests
  for that version pass.

## Implemented scaffolding decisions

- npm 10 workspaces manage `apps/web`, `apps/server`, and `packages/shared`.
- Node.js 20.20 is the minimum supported local runtime. The production image
  uses Node.js 24.
- Zod defines and validates versioned wire contracts and environment input.
- TypeScript, ESLint, and Prettier provide static and formatting checks.
- Vitest is the unit and integration test runner.
- Vite builds and serves the React client in development.
- `better-sqlite3` provides synchronous transaction boundaries. Ordered
  migrations run at startup, UUIDs and UTC timestamps use text columns, and
  file-backed databases use WAL mode.
- `idb` provides the browser repository boundary. Workout and outbox changes
  share one transaction; synchronization is serialized and idempotent.
- The current `0.2.0` product contract includes one active workout per device,
  strength/calisthenics/cardio types, ISO-weekday templates with optional named
  days and full day swaps that move exercises, targets, and names together,
  any unfinished day selectable with today as the default, device-local
  completed-day markers that reset Monday midnight, confirmed workout
  cancellation that does not consume a day, device-local Metric/Imperial units,
  duration and interval cardio, previous-set hints, collapsible completed
  exercises, a shared stretching poster, and history detail pages with online
  set-value editing. History edits cannot change exercise entries or their
  order. Strength exercise details show dated Epley estimated one-rep max and
  training-volume charts. The deployment remains trusted and single-user
  without built-in authentication.
- Exercise demonstrations are validated GIF, PNG, or JPEG uploads of at most
  five MiB, stored below `/data/media`, and prefetched into a dedicated offline
  application cache. Website import is not part of the product. Exercises may
  instead store an optional validated HTTP/HTTPS reference link, which is
  copied into template and workout snapshots for use during a workout.
- A single stretching-poster image is configured online in Settings and shared
  across devices on the deployment; Today opens its uncropped view. Appearance
  and measurement preferences remain device-local.

These remain revisable while Spotter is in the `0.x` development line.

## Release and next task

For `v0.2.0`, run the browser-level offline/reload/reconnect and current UI
flows, complete accessibility and mobile QA, smoke-test container persistence,
and release only after every acceptance criterion passes. After that release,
continue with the remaining work in the implementation plan and open product
decisions.

## Starter prompt for a new AI chat

Copy this prompt into a new chat opened at the repository root:

```text
Continue development of Spotter from this repository. Before changing files,
read AGENTS.md, README.md, docs/project-context.md, docs/product-spec.md,
docs/architecture.md, and docs/implementation-plan.md. Treat the documented
baseline decisions as requirements and the listed open decisions as unresolved.
Inspect the current branch and worktree, summarize the state, and implement the
next incomplete milestone from docs/implementation-plan.md. Keep the offline
workout boundary, single-image deployment, develop branch, and 0.x release
policy intact. Run relevant checks, update documentation when selecting an
implementation dependency, and do not create a release tag unless explicitly
asked.
```

## Completion standard for future work

A change is complete when its behavior is implemented, relevant automated
checks pass, documentation matches reality, migrations and offline schema
changes are safe, and the worktree contains no unintended changes. Release and
deployment changes also require a container smoke test and verification that
ordinary commits do not publish images.
