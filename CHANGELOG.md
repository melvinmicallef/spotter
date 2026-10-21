# Changelog

All notable changes to Spotter are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Pre-release React PWA, Express API, SQLite persistence, IndexedDB
  synchronization, container packaging, and CI foundations for `0.1.0`.
- A tested release-metadata check that rejects malformed release tags and
  derives traceable application versions for manual container builds.
- A documented release checklist and release-note process.

### Changed

- Validation now runs for every branch push as well as pull requests.
- Stable release tags publish exact, minor, and `latest` image tags;
  prereleases publish only their exact version tag.

No release has been published yet. At release time, move the relevant entries
from `Unreleased` into a dated version section and add comparison links.
