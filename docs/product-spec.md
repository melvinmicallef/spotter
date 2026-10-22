# Spotter Product Specification

Status: Current product behavior for the `0.2.0` release. Items in "Open
product decisions" remain unresolved.

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
- Allow exercises and reusable workout templates to be maintained through an
  online interface, using a built-in muscle catalogue.
- Support a straightforward self-hosted deployment with one Docker image and a
  persistent SQLite database.

## Initial non-goals

- Editing catalogue or template data while offline.
- Social features, coaching, leaderboards, or public profiles.
- Wearable integrations and automatic exercise recognition.
- Collaborative editing or real-time multi-device workout updates.
- Publishing a native iOS or Android application.

The initial `0.1.0` release and current `0.2.0` target one trusted user per
deployment without built-in authentication. The server boundary keeps
ownership and authorization concerns isolated so accounts can be added without
rewriting the workout model. An untrusted or internet-exposed deployment
requires an authenticating reverse proxy until that product work is completed.

## Core concepts

### Muscle

A selectable leaf in the built-in ExRx muscle hierarchy, used to classify
exercises. Parent group and subgroup labels organize the catalogue but cannot be
assigned. A leaf muscle can be linked to many exercises as primary or secondary.

### Exercise

A movement that can be placed in a template or workout. Its initial fields are
a stable ID, name, type, optional preparation instructions, optional execution
instructions, optional comments, optional HTTP/HTTPS reference link, and
associated muscles. Every exercise is either:

- **strength**, recorded as sets with repetitions and optional weight;
- **calisthenics**, recorded as sets and repetitions without weight; or
- **cardio**, planned in duration mode (minutes and seconds) or interval mode,
  and recorded with duration and optional distance. Interval timing is
  configured per workout rather than on the reusable template.

### Weekly workout template

An ordered, reusable seven-day workout plan. Each day from Monday through
Sunday can have an optional name and contain multiple ordered exercises with
type-appropriate targets. Weekly templates do not have notes. Exactly one
template is active when templates exist. The current weekday is selected by
default, and the user can select any other unfinished day directly. An empty or
ad-hoc "open workout" cannot be started. Finishing a workout marks its template
day complete for the current ISO week on this device. Completed days are greyed
out until Monday at local midnight. Cancelling a workout leaves that day
available. The workout receives a snapshot that remains valid if the weekly
template later changes.

Today shows the number of local calendar days the active template has been in
use. Editing an active template does not reset the count; activating a different
template starts its count, and reactivating a previously used template starts a
new count. The activation date displays as zero days. For installations
upgraded before activation timestamps existed, the counter starts when the
migration runs.

### Workout session

A dated workout instance with a lifecycle of in progress or completed. It
contains ordered exercise entries and their recorded sets. When started from a
template, it snapshots that weekday's optional name so later template edits do
not change the workout's history.

### Recorded effort

A strength effort supports repetitions and optional weight with explicit `kg`
or `lb` units. A calisthenics effort supports repetitions without a weight
field. A duration cardio entry stores one duration in seconds and an optional
target distance. A template can select interval mode but stores no interval
timing. Each workout snapshot stores its prep, work, and rest durations plus
iteration count. Starting an interval workout prefills those values from the
latest completed interval execution of the same exercise, across templates;
the first execution defaults to 0 prep seconds, 30 work seconds, 30 rest
seconds, and 8 iterations. The user can adjust them before starting the timer.
The timer beeps for the last five seconds of each stage and when a stage
changes; finishing the timer records total work time. Cardio results retain
duration and distance with explicit `km` or `mi` units, including distance
recorded as an interval result. The UI must show only the fields that apply to
the exercise type. Weight and distance entry use the units derived from the
Metric or Imperial system selected in device Settings.
Changing that preference converts displayed active-workout and template target
values while saved efforts and history retain their recorded units.

## Functional requirements

### Installable PWA

Spotter provides a web app manifest with standalone display, a root start URL,
192px and 512px PNG icons, and a maskable Android icon. On browsers that expose
an installation prompt, the client provides an Install action. A remote
deployment must be opened over HTTPS for browser installation; localhost is
reserved for development on the same device.

### Stretching poster

Settings allows the user to upload one GIF, PNG, or JPEG stretching poster up
to 5 MiB. The poster is stored with the server's persistent application data
and shared by devices using that deployment. The Today workout page provides a
Show stretching action that opens a simple, uncropped poster view. Replacing or
removing the poster requires a connection; the PWA caches the image after it
has been loaded so it can be viewed offline on that device.

### Measurement system

Settings stores a device-local measurement system. New installations default
to Metric; Metric uses kilograms and kilometres, while Imperial uses pounds
and miles. Active workout and template target values are converted for display
when the preference changes, and newly entered values are recorded in the
selected unit. Completed workout history retains the units recorded with each
effort.

### Appearance

The user can switch between light and dark appearance modes. The selected mode
is stored locally on the device and is applied before the PWA renders on later
visits. The control is available on the Settings page from the bottom
navigation. A device with no saved selection initially follows its
operating-system color-scheme preference.

### Catalogue management

While online, a user can:

- create, view, edit, and delete exercises;
- choose whether an exercise is strength, calisthenics, or cardio;
- record preparation and execution instructions separately, with optional
  comments displayed below execution;
- add target muscles one at a time as primary or secondary, prevent duplicate
  assignments, allow multiple secondary muscles, and display primary muscles
  first;
- attach or replace a GIF, PNG, or JPEG demonstration using click-to-select or
  drag and drop; removing the displayed image is saved only when the exercise
  changes are saved;
- add or change an optional exercise reference link; and
- receive a clear validation or dependency error when a destructive change
  would invalidate existing data.

Exercise mutations are unavailable offline. The muscle directory is always
read-only. Previously synchronized catalogue records may still be used as
read-only workout references.

The built-in muscle directory contains only selectable leaf entries from the
ExRx Exercise & Muscle Directory. Top-level areas such as Neck, Shoulders, and
Back, plus intermediate labels such as Deltoid and Trapezius, are retained as
non-selectable hierarchy. Leaf names, hierarchy, stable IDs, and source links
are supplied by the application rather than entered by the user.

Exercises are shown in a compact list with their image, title, and target
muscles. Selecting one opens a read-only details page with explicit edit and
delete actions; deletion requires confirmation. Creation, details, and editing
happen on dedicated, refresh-safe URLs keyed by the exercise UUID where
applicable. ExRx source links in the muscle directory open in a new tab.

Uploaded exercise demonstrations may be GIF, PNG, or JPEG, are limited to 5
MiB, stored under the persistent `/data` path, and removed when their exercise
is deleted or the media is explicitly replaced. The client warms a dedicated
application cache after synchronizing reference data so uploaded demonstrations
remain available with the cached exercise catalogue offline. Website import is
not supported. A manually entered exercise reference URL is copied into the
workout snapshot and shown during the workout; following that external link
still requires connectivity unless the destination is independently cached.

### Template management

While online, a user can:

- create, rename, duplicate, edit, delete, and activate a weekly template;
- add multiple exercises to any day of the week from a visual picker that shows
  demonstration images and filters by exercise name or muscle;
- assign an optional name to each weekday, such as "Legs" or "Chest & Back";
- swap all exercises between any two weekdays; exercise targets and optional
  day names move with the exercises, including when one weekday is a rest day;
- remove and reorder exercises within each day; and
- configure type-appropriate initial targets, with repetitions shown before
  sets for strength and calisthenics exercises; and
- choose duration or interval mode for each cardio entry.

Template exercises do not have notes, and weekly templates do not have notes.

Template mutations are unavailable offline. A cached template can be used to
start a workout if all data required for its workout snapshot is available.
Templates are presented as a compact list. Selecting one opens a read-only
details page with its weekly schedule; edit and delete actions are available
from that page, while creation and editing use dedicated, refresh-safe URLs.
Deleting a weekly template requires explicit confirmation.

### Workout tracking

A user can:

- start the populated workout for any unfinished weekday in the active weekly
  template, with the current weekday selected by default;
- see each weekday's optional title or its Rest label and select a day directly;
- finish a workout to mark that template day complete for the current ISO week;
- cancel a workout after confirmation, deleting its progress without marking
  the template day complete;
- resume the current in-progress workout;
- add, remove, and reorder workout exercises;
- mark individual exercises complete to collapse them and reopen them when
  needed;
- add, edit, and remove sets;
- display strength weights and repetitions in a compact grid, with controls to
  add or remove each exercise's sets;
- show the most recent completed workout entry with recorded strength
  repetitions or weight as placeholders by set position, regardless of the
  template used. Exercise ID is the primary match, with an exact name and type
  match as a fallback for legacy or duplicated catalogue entries. Today's
  values remain empty; only sets present in today's workout are shown, so new
  sets beyond the previous workout stay blank and previous extra sets are
  omitted;
- record repetitions and weight for strength exercises;
- record repetitions without weight for calisthenics exercises;
- record cardio duration as minutes and seconds, or configure prep, work,
  rest, and iterations for an interval timer. Interval values prefill from the
  latest completed interval execution of that exercise across templates, with
  defaults on first use. The timer uses audible five-to-one countdown and
  stage-transition beeps and resumes its saved countdown after a refresh on
  the same device;
- record optional distance for cardio exercises;
- open an exercise guide modal with its demonstration, instructions, comments,
  reference link, and target muscles;
- finish a workout, with a warning and an option to continue if exercises are
  still incomplete;
- view workout history with the local weekday and full date, template name,
  and exercise names;
- open a completed workout's details page and edit its recorded set count,
  repetitions, weight, duration, or distance without adding, removing, or
  reordering its exercise entries;
- view a strength exercise's progress over workout dates using Epley estimated
  one-rep max and total training volume (weight × repetitions summed across
  sets); and
- delete a completed workout from history after confirming in an in-app dialog.

Starting, updating, and finishing a workout must work offline after the PWA and
required reference data have been loaded at least once.
Deleting history is online-only. Pending workout changes must synchronize before
deletion so an older outbox operation cannot recreate the deleted workout.
Completed-history edits are also online-only and require pending workout changes
to synchronize first. They can change only set values and set counts; exercise
entries and their snapshots remain fixed.

## Offline contract

IndexedDB stores:

- the active workout and its entries;
- workout changes waiting to be synchronized;
- the read-only exercise, muscle, and template data required for workout
  tracking;
- synchronization metadata such as stable IDs and server revision markers;
- completed days for the active template, keyed by ISO week; and
- cancellation tombstones for workouts that may already have synchronized.

Every offline-created entity uses a client-generated UUID. Synchronization is
idempotent: retrying an acknowledged operation must not create another session,
exercise entry, or set.

The interface must show whether the application is offline, whether changes
are waiting to synchronize, and whether the last synchronization failed.
Each workout edit, including typed measurements and exercise completion, is
saved to IndexedDB with its outbox operation. Closing or refreshing the PWA must
not discard saved local workout changes.

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
- The Settings page stores the preferred measurement system (Metric or
  Imperial) on the current device. Metric is the default for new installations.
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

## Initial `0.1.0` acceptance criteria

The first usable release is complete when:

1. the PWA can be installed and reopened;
2. exercises and templates can be managed while online, and the built-in muscle
   hierarchy can be browsed and assigned;
3. a workout can be started online, continued without a connection, and
   completed offline;
4. refreshing or closing the browser does not lose that workout;
5. reconnecting synchronizes it exactly once and exposes it in history;
6. catalogue and template edit controls cannot mutate data offline;
7. the application and API run from one container with a mounted data volume;
8. automated tests cover the critical offline and synchronization paths; and
9. the initial `v0.1.0` tag publishes a versioned image to GHCR, while a normal
   commit does not.

## `0.2.0` acceptance additions

1. Calisthenics can be planned and recorded with repetitions and sets without
   weight fields; duration cardio accepts minutes and seconds, while interval
   cardio configures prep, work, rest, and iterations per workout, prefilling
   from the previous completed interval execution of that exercise.
2. The interval timer beeps for the final five seconds and on stage changes,
   records total work duration, and restores its countdown after a refresh.
3. Strength inputs show previous completed values as placeholders, leave the
   new workout empty, and only display sets that are planned today. Sets can be
   added or removed, and completed exercises can be collapsed and reopened.
4. Settings stores a device-local Metric or Imperial preference and a shared
   stretching poster can be opened from Today and viewed offline after it has
   loaded on that device.
5. Playwright covers these user flows along with catalogue and template
   management, deletion dialogs, PWA shell behavior, history, and offline
   synchronization before a release is tagged.

## Open product decisions

- What retention or export behavior is required for workout history?

## Initial `0.1.0` product decisions carried forward

- One in-progress workout is supported per device.
- Weekly templates use ISO weekdays (`1` = Monday through `7` = Sunday) and
  allow multiple ordered exercises on each day.
- Exactly one weekly template is active when any templates exist. Ad-hoc open
  workouts are unavailable; each new workout is a snapshot of the selected
  unfinished weekday in that active template. The current weekday is selected
  by default. Finished days are stored per device and ISO week, then reset when
  the local week changes at Monday midnight. Cancelling a workout does not
  consume its day.
- Strength efforts record repetitions and optional weight in explicit `kg` or
  `lb` units derived from the device's Metric or Imperial Settings preference.
- Cardio efforts record duration and optional distance in explicit `km` or
  `mi` units derived from the same preference.
- Completed workouts can be edited online through a fixed-roster history editor;
  editing completed history is not supported offline.
- The initial deployment is a trusted single-user installation without built-in
  authentication.
