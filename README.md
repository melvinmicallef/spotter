# Spotter

Spotter is a self-hosted, installable workout-tracking PWA. It combines a
React and TypeScript client with an Express API and SQLite database, delivered
as a single Docker image.

The project is currently in its specification and initial implementation
phase.

## Product principles

- Workout logging must remain usable when the device loses connectivity.
- Exercises, muscles, and workout templates are managed only while online.
- Offline writes must synchronize without creating duplicate workouts or sets.
- Deployment should be simple: one container and one persistent data volume.
- Release images are published deliberately from `v*` tags or a manual
  workflow run, not from every commit.

## Planned architecture

| Area | Technology | Responsibility |
| --- | --- | --- |
| Web application | React, TypeScript, Vite | Installable PWA and workout UI |
| Offline storage | IndexedDB | Active workouts and pending synchronization |
| API | Express, TypeScript | Validation, persistence, and synchronization |
| Server storage | SQLite | Canonical application data |
| Deployment | Docker | One production image serving the API and PWA |
| Releases | GitHub Actions, GHCR | Build images for release tags and manual runs |

In production, Express will serve the compiled PWA and expose the API under
`/api`. SQLite data will live in a mounted `/data` directory so application
updates do not replace user data.

## Offline behavior

The installed application will cache enough read-only exercise and template
data to log a workout without a network connection. While offline, a user can:

- start or resume a workout;
- add exercises from the cached catalogue;
- record sets, repetitions, weight, notes, and completion state; and
- finish a workout.

Creating or editing exercises, muscles, and templates requires a connection.
The interface will disable those actions while offline and explain that they
will become available after reconnecting.

See the [product specification](docs/product-spec.md) for feature boundaries
and acceptance criteria, and the [architecture](docs/architecture.md) for the
proposed system design and delivery model.

## Repository status

The application has not been scaffolded yet. The proposed implementation order
is:

1. establish the TypeScript workspace and shared validation schemas;
2. implement the SQLite schema and Express API;
3. build online catalogue and template management;
4. add local workout storage and synchronization;
5. package the application as one Docker image; and
6. add validation and release workflows.

Development, testing, and deployment commands will be added with the project
scaffolding.

## Release policy

Ordinary commits and pull requests should run validation such as linting,
type-checking, tests, and a production build. They should not publish an image.

Container publishing will be triggered by:

- pushing a tag matching `v*`, for example `v0.1.0`; or
- starting the release workflow manually through GitHub Actions.

Images will be published to `ghcr.io/melvinmicallef/spotter`.
