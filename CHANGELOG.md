# Changelog

All notable changes to Spotter are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/melvinmicallef/spotter/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/melvinmicallef/spotter/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/melvinmicallef/spotter/releases/tag/v0.1.0
