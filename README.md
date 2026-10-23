# Spotter

Spotter is a self-hosted, installable workout-tracking PWA. It combines a
React and TypeScript client with an Express API and SQLite database, delivered
as a single Docker image.

The project is developed on the `develop` branch. Its npm workspace contains
the React client, Express server, and shared wire contracts. The current release
is `1.0.0`.

Spotter is a vibe-coded app built with OpenAI Codex.

## Product principles

- Workout logging must remain usable when the device loses connectivity.
- Exercises and workout templates are managed only while online. Muscles are a
  built-in, read-only hierarchy sourced from the ExRx directory.
- Strength, calisthenics, and cardio exercises use different planning and
  recording fields.
- Exactly one weekly template is active when templates exist. The current
  weekday is selected by default, and any unfinished weekday can be selected
  directly without changing the reusable template. Ad-hoc open workouts are
  not part of the product.
- Today shows how many local calendar days the active plan has been in use.
- Finishing a workout marks its template day complete for the current ISO week
  on this device. Completed days are greyed out until Monday at local midnight;
  selecting one again asks for confirmation before repeating it. Cancelling a
  workout leaves its day available.
- A light/dark appearance switch on the Settings page is retained on the current device.
- A device-local Metric or Imperial preference derives weight and distance
  units; Metric is the default for new installations.
- Settings can store one shared stretching poster; Today opens its uncropped
  view, which is cached for offline viewing after it loads on a device.
- Offline writes must synchronize without creating duplicate workouts or sets.
- Deployment should be simple: one container and one persistent host data directory.
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

- start any unfinished day from the cached active weekly template, with today's
  day selected by default, or resume an in-progress workout;
- record sets, repetitions, and weight for strength exercises;
- record sets and repetitions without weight for calisthenics exercises;
- record duration and optional distance for duration-based cardio, or use an
  interval timer with prep, work, rest, and iteration stages. The timer can
  skip the current stage, beeps for the last five seconds and at stage changes,
  and resumes after a refresh on the same device; interval history records work
  duration without distance;
- mark finished exercises complete to collapse them while keeping progress
  available to resume;
- record completion state; and
- finish a workout, with a warning and a choice to continue when exercises are
  still incomplete; or cancel it after confirmation without using up that day.

Creating or editing exercises and templates requires a connection.
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
- online-only creation and editing of templates and exercises, with a built-in
  read-only muscle hierarchy;
- one production Docker image serving the PWA and API;
- one persistent host directory mounted at `/data` for SQLite;
- GitHub Container Registry at `ghcr.io/melvinmicallef/spotter`;
- image publication only for pushed `v*` tags or manual workflow dispatch;
- `develop` as the default branch; and
- semantic versioning beginning at `0.1.0`, with `1.0.0` establishing the
  stable trusted, single-user contract.

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

The Playwright suite runs the production PWA and API against an isolated,
temporary SQLite database:

```bash
npx playwright install chromium
npm run test:e2e
```

It covers offline installation and synchronization, online exercise and
template management, in-app deletion confirmations, typed strength,
calisthenics, and cardio workouts, cardio interval setup and audible timer
recovery, previous-set hints, unit preferences, theme persistence, and
stretching-poster upload, removal, and offline viewing. If the Playwright
browser download is unavailable, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a
compatible local Chromium or Chrome executable. The validation and release
workflows install Chromium before running the browser suite.

The implementation order is:

1. establish the TypeScript workspace and shared validation schemas;
2. implement the SQLite schema and Express API;
3. build online catalogue and template management;
4. add local workout storage and synchronization;
5. package the application as one Docker image; and
6. add validation and release workflows.

The separate muscle and exercise catalogues, weekly templates, offline workout
lifecycle, IndexedDB persistence, idempotent synchronization, PWA shell, and
production container are implemented. The exercise catalogue supports primary
and secondary muscle roles, preparation and execution instructions, optional
comments and reference links, and validated GIF, PNG, or JPEG demonstrations.
Workout entry uses compact, type-specific fields. Optional names for each
weekday are supported, and the template editor can swap full workout days,
including their exercises, targets, and names. Template-wide notes are no
longer part of the template editor. History shows exercise names,
opens completed-workout details, and supports online set-value and set-count
edits without changing a workout's exercise list. Interval history has a
dedicated editor for its prep, work, rest, rounds, and recorded work time.
Strength exercise details include Epley estimated one-rep max and
training-volume graphs by workout date.

## Run the production image

Create a `compose.yaml` file for a self-hosted instance:

```yaml
services:
  spotter:
    image: ghcr.io/melvinmicallef/spotter:latest
    ports:
      - '3000:3000'
    volumes:
      - ./data:/data
    restart: unless-stopped
```

The `./data` directory next to `compose.yaml` stores the SQLite database and
uploaded exercise images on the host, outside the container. To pin upgrades,
replace `latest` with a released version such as `1.0.0`.

Start the instance:

```bash
docker compose pull
docker compose up -d
```

Then open `http://localhost:3000`. The host directory mounted at `/data` retains
`spotter.sqlite`, its WAL files, and uploaded media when the container is
replaced.

### Install on Android

Open Spotter in Chrome on Android through HTTPS. If Spotter runs on another
computer or server, put an HTTPS reverse proxy in front of it and open that
HTTPS address on the phone. The plain HTTP address is suitable for local
development on the same device, but a LAN address such as
`http://192.168.1.20:3000` is not a secure origin and cannot be installed as a
PWA. Tap Spotter's **Install** action when it appears, or open Chrome's menu
and choose **Install app** or **Add to Home screen**. The app manifest includes
192px and 512px PNG icons and a maskable icon for Android.

The application currently targets a trusted, single-user deployment. Put an
authentication-aware reverse proxy in front of it before exposing it to an
untrusted network.

## Continuing in a new AI chat

Open the repository at its root and ask the new chat to read `AGENTS.md` and the
documentation listed above before changing files. A complete starter prompt is
available in [the project handoff](docs/project-context.md#starter-prompt-for-a-new-ai-chat).

Release `v1.0.0` is the current version. Releases should follow the acceptance,
test, accessibility, mobile QA, and release-candidate gates in the
[release guide](docs/releasing.md).

## Release policy

Ordinary commits and pull requests should run validation such as linting,
type-checking, tests, and a production build. They should not publish an image.

The first application version was `0.1.0`. Version `1.0.0` establishes the
stable public contract for trusted, single-user deployments. Authentication,
multi-user support, export, and retention remain future work. The upgrade from
`0.2.0` requires a database and browser-data reset; see the
[operations guide](docs/operations.md#upgrade).

Container publishing is triggered by:

- pushing a strict Semantic Version tag beginning with `v`, such as `v1.0.0`;
  its publish job runs only after `Validate` passes, and malformed
  `v*` tags fail before publication; or
- starting the release workflow manually through GitHub Actions.

Images will be published to `ghcr.io/melvinmicallef/spotter`.
Stable tags publish exact, minor, and `latest` image tags. Prereleases publish
only the exact prerelease version, and manual runs publish only an explicit tag
or a unique `sha-<commit>` fallback. Release `v1.0.0` publishes `1.0.0`,
`1.0`, and `latest`; earlier immutable image tags remain available.
