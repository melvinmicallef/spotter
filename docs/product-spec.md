# Spotter Product Specification

Status: Approved initial baseline. Items in "Open product decisions" remain
unresolved.

## Purpose

Spotter is a focused workout tracker for planning workouts and recording them
at the gym. The application is installable as a PWA and keeps workout logging
available when connectivity is unreliable or absent.

The server remains the canonical store, while the browser keeps a local copy of
the data needed to complete an active workout and a queue of changes waiting to
be synchronized.

## Goals

- Make starting and recording a workout fast on a phone-sized screen.
- Preserve an in-progress workout through refreshes, browser restarts, and
  network loss.
- Synchronize offline workout activity safely after reconnecting.
- Allow exercises, muscles, and reusable workout templates to be maintained
  through an online interface.
- Support a straightforward self-hosted deployment with one Docker image and a
  persistent SQLite database.

## Initial non-goals

- Editing catalogue or template data while offline.
- Social features, coaching, leaderboards, or public profiles.
- Wearable integrations and automatic exercise recognition.
- Collaborative editing or real-time multi-device workout updates.
- Publishing a native iOS or Android application.

Version `0.1.0` targets one trusted user per deployment without built-in
authentication. The server boundary keeps ownership and authorization concerns
isolated so accounts can be added without rewriting the workout model. An
untrusted or internet-exposed deployment requires an authenticating reverse
proxy until that product work is completed.

## Core concepts

### Muscle

A named body area used to classify exercises. A muscle can be linked to many
exercises, optionally with a relationship such as primary or secondary.

### Exercise

A movement that can be placed in a template or workout. Its initial fields are
a stable ID, name, type, optional preparation instructions, optional execution
instructions, and associated muscles. Every exercise is either:

- **strength**, recorded as sets with repetitions and optional weight; or
- **cardio**, recorded as efforts with duration and optional distance.

### Weekly workout template

An ordered, reusable seven-day workout plan. Each day from Monday through
Sunday can contain multiple ordered exercises with type-appropriate targets and
notes. Exactly one template is active when templates exist. A workout is
started only from today's populated schedule in that active template; an empty
or ad-hoc "open workout" cannot be started. The user may swap today's assigned
day with another weekday for the current ISO week on the current device. The
workout receives a snapshot that remains valid if the weekly template later
changes.

### Workout session

A dated workout instance with a lifecycle of in progress or completed. It
contains ordered exercise entries and their recorded sets.

### Recorded effort

A strength effort supports repetitions, weight, explicit `kg` or `lb` units,
notes, and a completion marker. A cardio effort supports duration in seconds,
distance, explicit `km` or `mi` units, notes, and a completion marker. The UI
must show only the fields that apply to the exercise type.

## Functional requirements

### Appearance

The user can switch between light and dark appearance modes. The selected mode
is stored locally on the device and is applied before the PWA renders on later
visits. A device with no saved selection initially follows its operating-system
color-scheme preference.

### Catalogue management

While online, a user can:

- create, view, edit, and delete muscles;
- create, view, edit, and delete exercises;
- choose whether an exercise is strength or cardio;
- record preparation and execution instructions separately;
- associate exercises with muscles as primary or secondary;
- attach or replace a GIF, PNG, or JPEG demonstration; and
- receive a clear validation or dependency error when a destructive change
  would invalidate existing data.

Catalogue mutations are unavailable offline. Previously synchronized catalogue
records may still be used as read-only workout references.

Exercises are shown in a compact list with their image, title, and target
muscles. Selecting one opens a read-only details page with explicit edit and
delete actions; creation and editing happen on dedicated screens.

Uploaded exercise demonstrations may be GIF, PNG, or JPEG, are limited to 5
MiB, stored under the persistent `/data` path, and removed when their exercise
is deleted or the media is explicitly replaced. The client warms a dedicated
application cache after synchronizing reference data so uploaded demonstrations
remain available with the cached exercise catalogue offline. Website import is
not supported.

### Template management

While online, a user can:

- create, rename, duplicate, edit, delete, and activate a weekly template;
- add multiple exercises to any day of the week from a visual picker that shows
  demonstration images and filters by exercise name or muscle;
- remove and reorder exercises within each day; and
- configure exercise-level notes and type-appropriate initial targets.

Template mutations are unavailable offline. A cached template can be used to
start a workout if all data required for its workout snapshot is available.

### Workout tracking

A user can:

- start only today's populated workout in the active weekly template;
- swap today's assigned template day with another weekday for the current ISO
  week without changing the template;
- resume the current in-progress workout;
- add, remove, and reorder workout exercises;
- add, edit, complete, and remove sets;
- record repetitions and weight for strength exercises;
- record duration and distance for cardio exercises;
- record notes;
- finish a workout; and
- view synchronized workout history.

Starting, updating, and finishing a workout must work offline after the PWA and
required reference data have been loaded at least once.

## Offline contract

IndexedDB stores:

- the active workout and its entries;
- workout changes waiting to be synchronized;
- the read-only exercise, muscle, and template data required for workout
  tracking; and
- synchronization metadata such as stable IDs and server revision markers; and
- the current device's active-template day swaps, keyed by ISO week.

Every offline-created entity uses a client-generated UUID. Synchronization is
idempotent: retrying an acknowledged operation must not create another session,
exercise entry, or set.

The interface must show whether the application is offline, whether changes
are waiting to synchronize, and whether the last synchronization failed.
Closing or refreshing the PWA must not discard acknowledged local workout
changes.

The initial conflict policy is deliberately narrow:

- workout data created on one device is uploaded using its stable IDs;
- catalogue and template changes originate only from the server while online;
- server validation failures remain in the queue and are shown to the user;
  and
- simultaneous editing of one workout on multiple devices is not supported in
  the first release.

## Data and deletion behavior

- Workout entries retain snapshots of display data needed to understand
  historical sessions after a template changes.
- Deleting an exercise or muscle must not make historical workouts unreadable.
- Dates are transferred and stored unambiguously; presentation uses the
  device's local timezone.
- Weight units must be recorded with, or normalized alongside, their values so
  unit changes do not reinterpret history.
- Database migrations must be ordered, repeatable, and applied before the API
  accepts traffic.

## User experience requirements

- The primary workout controls must work comfortably on a phone.
- Saving a set should not depend on a round trip to the server.
- Online-only controls visibly indicate when they are unavailable.
- Synchronization errors must preserve the user's local data and offer a retry.
- PWA installation and update behavior should be predictable; an update must
  not silently replace an active workout.

## Deployment and release requirements

- One production Docker image contains the compiled client and Express server.
- The SQLite file and related database files live under `/data` in production.
- Runtime configuration is supplied through environment variables.
- The container exposes an HTTP health endpoint suitable for orchestration.
- The first development release is version `0.1.0`; subsequent development
  releases remain in the `0.x` range until the product and its public contracts
  are ready for `1.0.0`.
- GitHub Actions publishes to `ghcr.io/melvinmicallef/spotter` only for pushed
  `v*` tags or a manual workflow dispatch.
- Pull requests and ordinary branch pushes validate the application without
  publishing an image.

## Initial acceptance criteria

The first usable release is complete when:

1. the PWA can be installed and reopened;
2. exercises, muscles, and templates can be managed while online;
3. a workout can be started online, continued without a connection, and
   completed offline;
4. refreshing or closing the browser does not lose that workout;
5. reconnecting synchronizes it exactly once and exposes it in history;
6. catalogue and template edit controls cannot mutate data offline;
7. the application and API run from one container with a mounted data volume;
8. automated tests cover the critical offline and synchronization paths; and
9. the initial `v0.1.0` tag publishes a versioned image to GHCR, while a normal
   commit does not.

## Open product decisions

- What retention or export behavior is required for workout history?

## Initial `0.1.0` product decisions

- One in-progress workout is supported per device.
- Weekly templates use ISO weekdays (`1` = Monday through `7` = Sunday) and
  allow multiple ordered exercises on each day.
- Exactly one weekly template is active when any templates exist. Ad-hoc open
  workouts are unavailable; every new workout is a snapshot of today's
  scheduled day in that active template, after applying any current-week
  device-local swap.
- Strength efforts record repetitions and optional weight in explicit `kg` or
  `lb` units.
- Cardio efforts record duration and optional distance in explicit `km` or
  `mi` units.
- Completed workouts are read-only; only an active workout is edited offline.
- The initial deployment is a trusted single-user installation without built-in
  authentication.
