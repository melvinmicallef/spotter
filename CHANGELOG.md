# Changelog

All notable changes to Spotter are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-10-23

### Changed

- Save and Create buttons show a spinner and stay disabled during submission;
  failed requests allow retry without losing the draft.
- Template duplication is an icon beside Edit and Delete, separate from Active.
- Exercise and stretching-poster upload controls are hidden while an image is
  present; remove the preview to choose a replacement.
- AI contributors must discuss breaking changes, migrations, and data deletion
  with the owner before implementing the affected work.
- Removing an exercise during a workout now requires confirmation, including
  offline; dismissing the dialog preserves its recorded sets and progress.
- Exercise pickers show full muscle paths. Template pickers keep Done in a
  sticky header; workout pickers close after one selection.
- Active workouts use mobile cancel/finish icons, separate exercise reordering
  from removal, and place sets beneath the header. Sets tables start compact,
  grow as sets are added, and scroll horizontally when space runs out.
- Active workouts hide reference links and the partial-strength-set message
  while preserving reference data and all validation rules.
- GIF list playback remains unchanged after evaluating viewport control; a
  reliable pause mechanism would need additional media handling without a
  demonstrated significant benefit.

### Removed

- Secondary muscle assignments and role selectors throughout the application.
  All exercise muscle assignments are now primary targets.

### Upgrade notes

For `1.2.0`, startup automatically applies SQLite migration
two to delete secondary muscle links and drop their role column. The PWA also
upgrades its cached exercise catalogue to remove secondary links, even offline.
Primary targets, exercises, templates, workout history, and pending workout
synchronization are kept. Back up `/data` before upgrading; deleted secondary
assignments can only be recovered from that backup. Older clients' secondary
assignments are ignored by the upgraded API.
Do not downgrade to `1.1.0` against the migrated database; restore a pre-upgrade
backup instead. Keep browser site data so unsynchronized workouts are retained.

### Known limitations

Dependencies are unchanged by owner decision. `npm audit --omit=dev` reports
the existing high-severity Zod 4.1.12 advisory
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
Continue to use the documented trusted, single-user deployment model.

## [1.1.0] - 2026-10-23

### Changed

- The runner artwork is used for the application and Android install icons,
  including the maskable icon.
- Swapping template days opens a dialog from a compact icon button, so the
  controls fit on portrait screens.
- Frontend, backend, and browser-test files are grouped by feature.

### Fixed

- The PWA manifest uses same-origin credentials so authenticated reverse
  proxies can serve it during Android installation.
- Form fields now disable autocomplete to suppress unrelated password,
  address, and payment suggestions in workout and catalogue entry.
- Muscles and Settings stay horizontally aligned with other pages when a
  desktop scrollbar appears. The page gradient is consistent across routes.
- Stretching posters display at their natural aspect ratio without black
  bands above or below the image on phones.
- Browser tests handle asynchronous catalogue deletion and concurrent PWA
  update notices during connection-status checks.

### Upgrade notes

Keep the mounted `/data` directory and browser site data when upgrading from
`1.0.0`; this release does not change the SQLite or IndexedDB schemas. Reopen
Spotter online to receive the updated PWA. If an Android home-screen shortcut
keeps the old icon, remove and recreate the shortcut.

## [1.0.0] - 2026-10-23

Spotter's first stable contract covers trusted, single-user deployments. The
offline workout workflow, API, and database model are now versioned as a stable
release. Authentication, multi-user support, export, and retention policies
remain outside this contract.

### Added

- Select any populated weekday from the active plan. Completed days stay marked
  for the local ISO week and can be repeated after confirmation; cancelling a
  workout leaves its day available.
- Optional weekday names and full-day swaps in the template editor, including
  targets and names.
- Online editing and deletion of completed workout history, with a fixed
  exercise roster, dedicated interval-history controls, and strength progress
  charts.
- Previous-set hints across templates, a filter for primary muscles in the
  exercise library, and planned duration beside interval workout controls.

### Changed

- Interval workouts prefill settings from the most recent completed execution
  of the same exercise and record actual work time when stages are skipped.
- SQLite starts from one canonical version-one schema. IndexedDB starts from a
  new `spotter-v2` database so old queued operations cannot sync into the
  reset server.

### Upgrade warning

**This release cannot open SQLite databases created by `0.1.0` or `0.2.0`.**
Before replacing an older container, stop it and remove its database file and
WAL sidecars. Clear Spotter's browser site data, including IndexedDB, and
remove media files linked only to the old database. This permanently discards
old workouts, templates, exercises, settings, and unsynchronized browser data.
See the [operations guide](docs/operations.md#upgrade) for the reset procedure.

## [0.2.0] - 2026-10-22

### Added

- Cardio duration and interval modes, with prep, work, rest, iterations,
  countdown and stage-transition beeps, and timer recovery after refresh.
- Reps-only calisthenics exercise type.
- Previous strength set values as placeholders that leave current sets empty.
- Per-exercise completion controls that collapse completed exercises while
  preserving their state locally and through synchronization.
- A shared stretching-poster setting, a Today shortcut, and device-local
  offline poster caching.
- Android PWA installation metadata and numeric input keyboards where suitable.

### Changed

- Strength and calisthenics workout entries use compact grids with controls to
  add or remove sets; workout effort notes are no longer part of the entry UI.
- The Compose example bind-mounts the host `./data` directory at `/data`.
- Playwright coverage includes current catalogue, template, typed-workout,
  Settings, stretching, PWA, and offline-recovery flows. The release workflow
  runs the browser suite before building and publishing the image.

### Fixed

- The add-set control retains its right border, and single-exercise counts use
  singular wording.
- Completed interval timers resume at their saved stage and countdown after a
  page refresh.

## [0.1.0] - 2026-10-22

- Initial published release with the offline-first workout PWA, exercise and
  template management, SQLite API, synchronization, and single-container
  deployment.

[Unreleased]: https://github.com/melvinmicallef/spotter/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/melvinmicallef/spotter/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/melvinmicallef/spotter/compare/v0.2.0...v1.0.0
[0.2.0]: https://github.com/melvinmicallef/spotter/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/melvinmicallef/spotter/releases/tag/v0.1.0
