# Spotter

Spotter is a self-hosted, installable workout-tracking PWA. It combines a
React and TypeScript client with an Express API and SQLite database, delivered
as a single Docker image.

The project is under active implementation on the `develop` branch. Its npm
workspace contains the React client, Express server, and shared wire contracts.
The first planned development release is `0.1.0`.

## Product principles

- Workout logging must remain usable when the device loses connectivity.
- Exercises, muscles, and workout templates are managed only while online.
- Strength and cardio exercises use different planning and recording fields.
- Exactly one weekly template is active when templates exist. Workouts start
  only from today's scheduled day; ad-hoc open workouts are not part of the
  product.
- Today's schedule can be swapped with another day for the current ISO week on
  the current device without changing the reusable template.
- A light/dark appearance switch is retained on the current device.
- Offline writes must synchronize without creating duplicate workouts or sets.
- Deployment should be simple: one container and one persistent data volume.
- Release images are published deliberately from `v*` tags or a manual
  workflow run, not from every commit.

## Planned architecture

| Area            | Technology              | Responsibility                                |
| --------------- | ----------------------- | --------------------------------------------- |
| Web application | React, TypeScript, Vite | Installable PWA and workout UI                |
| Offline storage | IndexedDB               | Active workouts and pending synchronization   |
| API             | Express, TypeScript     | Validation, persistence, and synchronization  |
| Server storage  | SQLite                  | Canonical application data                    |
| Deployment      | Docker                  | One production image serving the API and PWA  |
| Releases        | GitHub Actions, GHCR    | Build images for release tags and manual runs |

In production, Express will serve the compiled PWA and expose the API under
`/api`. SQLite data will live in a mounted `/data` directory so application
updates do not replace user data.

## Offline behavior

The installed application will cache enough read-only exercise and template
data to log a workout without a network connection. While offline, a user can:

- start today's workout from the cached active weekly template, including a
  device-local current-week day swap, or resume an in-progress workout;
- record sets, repetitions, and weight for strength exercises;
- record duration and distance for cardio exercises;
- record notes and completion state; and
- finish a workout.

Creating or editing exercises, muscles, and templates requires a connection.
The interface will disable those actions while offline and explain that they
will become available after reconnecting.

## Documentation

The repository documentation is intended to be sufficient for a contributor or
a new AI chat to continue without access to the original planning conversation.

Read the documents in this order:

1. [Project context and AI handoff](docs/project-context.md) — settled decisions,
   current state, constraints, and a ready-to-use continuation prompt.
2. [Product specification](docs/product-spec.md) — feature boundaries, user
   behavior, and acceptance criteria.
3. [Architecture](docs/architecture.md) — system boundaries, persistence,
   synchronization, container, and CI design.
4. [Implementation plan](docs/implementation-plan.md) — phased build order,
   deliverables, tests, and completion gates.
5. [Operations guide](docs/operations.md) — container use, runtime settings,
   persistence, backup, restore, and upgrades.
6. [Release guide](docs/releasing.md) — release gates, image-tag policy,
   checklist, and release-note process.

`AGENTS.md` contains concise repository-level instructions for AI coding agents.

## Finalized baseline

The following decisions are settled for the initial implementation:

- React and TypeScript installable PWA;
- Express and TypeScript server;
- SQLite canonical server database;
- IndexedDB local workout state and synchronization outbox;
- offline workout tracking after the application and reference data have been
  loaded at least once;
- online-only creation and editing of templates, exercises, and muscles;
- one production Docker image serving the PWA and API;
- one persistent `/data` volume for SQLite;
- GitHub Container Registry at `ghcr.io/melvinmicallef/spotter`;
- image publication only for pushed `v*` tags or manual workflow dispatch;
- `develop` as the default branch; and
- semantic versioning beginning at `0.1.0`, remaining on `0.x` during active
  development.

Choices explicitly listed as open in the documentation are not finalized and
must not be silently treated as requirements.

## Development

Use Node.js 20.20 or newer and npm 10 or newer:

```bash
npm ci
npm run dev
```

The client runs on `http://localhost:5173` and proxies API requests to the
Express server on `http://localhost:3000`. Validate the complete workspace with
`npm run check`; build it with `npm run build`; and serve the compiled client
and API together with `npm start`.

The browser-level PWA test runs against a production build and an isolated,
temporary SQLite database:

```bash
npx playwright install chromium
npm run test:e2e
```

It seeds reference data online, caches the application shell, records and
finishes a workout offline, reloads while offline, reconnects after a simulated
lost synchronization acknowledgement, and verifies that the server contains
exactly one workout and set. If the Playwright browser download is unavailable,
set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a compatible local Chromium or
Chrome executable. The validation workflow installs Chromium before running
this test. A second regression covers primary/secondary muscle roles through
the compact exercise list and detail/edit flow, PNG upload, the visual template
picker, typed strength/cardio recording, and expanded historical details.

The implementation order is:

1. establish the TypeScript workspace and shared validation schemas;
2. implement the SQLite schema and Express API;
3. build online catalogue and template management;
4. add local workout storage and synchronization;
5. package the application as one Docker image; and
6. add validation and release workflows.

The separate muscle and exercise catalogues, weekly templates, workout
lifecycle, IndexedDB persistence, idempotent synchronization, PWA shell, and
production container are implemented.
The exercise catalogue supports a compact list/detail workflow, primary and
secondary muscle roles, separate preparation and execution instructions, and
validated GIF, PNG, or JPEG demonstrations.
Workout, exercise-entry, set, and template-entry notes are editable, and
history expands to show the preserved exercise and set snapshots.

## Run the production image

```bash
docker compose up --build
```

Then open `http://localhost:3000`. The named volume mounted at `/data` retains
`spotter.sqlite` and its WAL files when the container is replaced.

The application currently targets a trusted, single-user deployment. Put an
authentication-aware reverse proxy in front of it before exposing it to an
untrusted network.

## Continuing in a new AI chat

Open the repository at its root and ask the new chat to read `AGENTS.md` and the
documentation listed above before changing files. A complete starter prompt is
available in [the project handoff](docs/project-context.md#starter-prompt-for-a-new-ai-chat).

The release automation is implemented, but no release has been approved or
published. The remaining release gates include the complete acceptance and test
matrix, accessibility and mobile QA, and release candidate verification. The
automated browser-level offline test must pass on the release commit. See the
[release guide](docs/releasing.md) before creating `v0.1.0`.

## Release policy

Ordinary commits and pull requests should run validation such as linting,
type-checking, tests, and a production build. They should not publish an image.

The first application version will be `0.1.0`. Spotter will remain on `0.x`
versions while its product behavior, data model, and API are still under active
development. Version `1.0.0` will mark the first stable public contract.

Container publishing is triggered by:

- pushing a strict Semantic Version tag beginning with `v`, such as `v0.1.0`;
  malformed `v*` tags fail validation before publication; or
- starting the release workflow manually through GitHub Actions.

Images will be published to `ghcr.io/melvinmicallef/spotter`.
Stable tags publish exact, minor, and `latest` image tags. Prereleases publish
only the exact prerelease version, and manual runs publish only an explicit tag
or a unique `sha-<commit>` fallback. No Spotter release has been published from
this repository state.
