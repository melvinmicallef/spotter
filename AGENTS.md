# Spotter Agent Instructions

These instructions apply to the entire repository.

## Read before changing code

Read these documents in order:

1. `README.md`
2. `docs/project-context.md`
3. `docs/product-spec.md`
4. `docs/architecture.md`
5. `docs/implementation-plan.md`
6. `docs/ai-breaking-changes.md`

The repository documentation is the durable source of project context. Update
it whenever an implementation decision changes the documented behavior.

## Current repository state

- The default branch is `develop`.
- The project contains a working application with an npm workspace,
  React PWA, Express API, SQLite persistence, IndexedDB outbox, Docker image,
  and GitHub Actions workflows.
- The first release was `0.1.0`; the current release is `1.2.0`.
- The production image will be `ghcr.io/melvinmicallef/spotter`.

## Non-negotiable initial constraints

- Use React and TypeScript for an installable PWA.
- Use Express and TypeScript for the HTTP server.
- Use SQLite as the canonical server database.
- Use IndexedDB for the active workout, cached reference data, and pending
  workout synchronization.
- Starting, updating, resuming, and finishing a workout must work offline after
  the application and required reference data have been loaded.
- Creating or editing templates and exercises is online-only. Muscles are a
  built-in, read-only hierarchy.
- Produce one production Docker image. Express serves both `/api/*` and the
  compiled PWA.
- Store production database state under the mounted `/data` path.
- Publish container images only for pushed `v*` tags and manual workflow runs.
  Ordinary commits and pull requests validate but do not publish images.
- The `1.0.0` release establishes the stable trusted, single-user contract.
  Future incompatible public-contract changes require a new major version.

Do not weaken the offline guarantees, split production into multiple required
containers, introduce online catalogue mutations while offline, or publish an
image for every commit without an explicit product decision changing the
baseline.

## Decision discipline

Follow [the AI breaking-change README](docs/ai-breaking-changes.md). Notify the
owner before implementing any change that migrates, deletes, clears, drops,
or silently discards existing data, or breaks an existing contract. Explain
the affected data, alternatives, recovery, and proposed release; discuss and
agree on the handling before proceeding with that part of the work. This
includes SQLite, IndexedDB, pending synchronization, media, and API fields.
Record explicit prior approval rather than asking again for the same decision.

The following remain outside the `1.0.0` contract: authentication and
multi-user tenancy, additional exercise measurement types, and data
export/retention. Completed-workout set and interval editing is implemented.

Prefer a reversible boundary over silently deciding an unresolved product
question. When a choice is required to scaffold the project, record it in the
architecture document or a dedicated decision record and explain its impact.

## Implementation expectations

- Keep browser, wire, and SQLite models separated by explicit schemas.
- Generate stable UUIDs on the client for offline-created workout entities.
- Make synchronization idempotent and enforce uniqueness in SQLite.
- Write local workout state and its outbox operation atomically.
- Preserve workout history when catalogue or template records change.
- Never use the service worker cache as the source of truth for workout data.
- Add tests with every vertical slice, especially for offline persistence,
  retry behavior, migrations, and duplicate prevention.
- Add or update Playwright coverage for user-visible browser behavior, including
  online catalogue/template flows, typed workouts, Settings, PWA installation
  and offline recovery. Run `npm run test:e2e` for release candidates in
  addition to `npm run check`.
- Keep changes focused and leave the worktree clean after committed work.

## Release discipline

- `develop` is the source branch unless the repository workflow later defines
  another release process.
- The first release tag was `v0.1.0`; the current release tag is `v1.2.0`.
- Stable release tags may update `latest`; prerelease tags must not.
- A manual image build uses an explicit image tag or a unique `sha-<commit>` tag.
- A pushed release tag must pass the `Validate` workflow before its dependent
  job calls the container publisher. Manual releases must run the same checks.
- Do not tag or push a release until formatting, lint, type checks, unit and
  integration tests, Playwright browser tests, production build, and Docker
  build have passed and release documentation is current.
