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
- Application status: specification only; no application code or package
  manifests have been created yet
- Planned first release: `0.1.0`
- Planned first release tag: `v0.1.0`
- Planned image: `ghcr.io/melvinmicallef/spotter`
- Current documents: product specification, architecture, implementation plan,
  this handoff, and repository agent instructions

## Product in one paragraph

Spotter is a self-hosted workout tracker designed primarily for phone use at
the gym. It is an installable React and TypeScript PWA backed by an Express and
TypeScript API with SQLite persistence. Workout logging is local-first: after
the application and reference data have been loaded, a user can continue an
active workout without connectivity and synchronize it later. Catalogue and
planning changes—muscles, exercises, and workout templates—are intentionally
online-only. The complete application ships as one Docker image.

## Settled decisions

These requirements have been explicitly agreed and should be treated as the
baseline.

| Area | Decision |
| --- | --- |
| Client | React with TypeScript |
| Distribution | Installable progressive web application |
| Server | Express with TypeScript |
| Canonical database | SQLite |
| Offline database | IndexedDB |
| Offline writes | Active workout tracking, including starting, resuming, recording, and finishing |
| Offline reference data | Cached read-only muscles, exercises, and templates needed to log a workout |
| Online-only writes | Creating, editing, reordering, or deleting muscles, exercises, and templates |
| Synchronization | Durable outbox, client-generated IDs, idempotent server application, automatic retry after reconnect |
| Production topology | One Docker image and one application process |
| HTTP serving | Express serves both `/api/*` and the compiled PWA |
| Persistent path | SQLite and related files under `/data` |
| Image registry | `ghcr.io/melvinmicallef/spotter` |
| Image triggers | Pushed `v*` tags and optional manual workflow dispatch |
| Ordinary CI | Validate commits and pull requests without publishing an image |
| Default branch | `develop` |
| Versioning | Semantic versioning beginning at `0.1.0`; remain on `0.x` during active development |

## Required user experience

The most important flow is recording a workout reliably in a gym with unstable
connectivity.

1. The user loads or installs Spotter while online.
2. The client synchronizes the catalogue and available workout templates.
3. The user starts an empty workout or creates one from a cached template.
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

Routine validation should include formatting, linting, type-checking, automated
tests, a production application build, and optionally a non-publishing Docker
build. Container publication is separate and runs only for `v*` tag pushes or
manual dispatch.

The first release is `v0.1.0`. A normal semantic version tag publishes
versioned image tags. `latest` may move for a normal `0.x` release, but must not
move for a prerelease such as `v0.2.0-beta.1`. A manually dispatched build must
use an explicit tag or a collision-safe `sha-<commit>` tag.

## Explicitly not finalized

Do not infer answers to these questions from the rest of the architecture:

- whether the first deployment is single-user or supports accounts;
- authentication, authorization, and deployment exposure;
- whether multiple in-progress workouts are supported;
- whether completed workouts can be edited offline;
- launch units and exercise measurement types beyond repetitions, weight, and
  notes;
- history export and retention requirements;
- package manager and supported Node.js version;
- SQLite driver and migration library; and
- IndexedDB wrapper or direct browser API usage.

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
- Do not tag `v0.1.0` until its acceptance criteria are met.

## Recommended next task

Create the initial workspace and a deliberately small vertical slice:

1. choose and document the package manager, active Node.js LTS baseline,
   validation library, SQLite stack, migration tool, and IndexedDB access layer;
2. scaffold `apps/web`, `apps/server`, and `packages/shared`;
3. add shared health/version response schemas;
4. implement `GET /api/health` and `GET /api/version`;
5. serve the built PWA through Express in production mode;
6. add formatting, linting, type-checking, unit tests, and production builds;
7. add a development workflow without publishing a container; and
8. update these documents with the selected implementation choices and actual
   commands.

This slice should prove the workspace and client/server/shared-package
boundaries. It should not attempt the complete workout domain in the first
commit.

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
