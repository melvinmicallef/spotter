# Spotter Release Guide

Spotter releases are deliberate. A pushed, strict Semantic Version tag first
runs the `Validate` workflow; its dependent publish job calls the reusable
image workflow only after validation succeeds and confirms the tag points to
the validated commit. Ordinary branch pushes and pull requests only validate.
Manual release dispatch runs its own checks before it can publish. The first
stable release was `v1.0.0`. This guide uses `v1.1.0` as an example; complete
the checklist before tagging each release.

## Version and image policy

- Release tags use `vMAJOR.MINOR.PATCH`, with an optional SemVer prerelease or
  build suffix. Examples: `v1.0.0` and `v1.1.0-beta.1`.
- The tag version must match the root package version, ignoring only optional
  SemVer build metadata.
- A stable `v1.1.0` tag publishes `1.1.0`, `1.1`, and `latest`; earlier
  immutable version tags remain available.
- A prerelease such as `v1.1.0-beta.1` publishes only
  `1.1.0-beta.1`; it does not move `1.1` or `latest`.
- The image receives `APP_VERSION` without the leading `v`, so `/api/version`
  reports `1.1.0` for tag `v1.1.0`.
- A manual workflow run publishes its explicit image tag, or the unique
  `sha-<full-commit>` fallback. Its application version is the package version
  plus `sha` build metadata, such as `1.1.0+sha.0123456789ab`.
- Strings that merely start with `v` but are not valid Semantic Versions fail
  before registry login or image publication.

The reusable release workflow is the only automation that pushes images. For
tag releases, the `Validate` workflow calls it from a dependent job that runs
only after successful validation of a pushed `v*` tag. It checks that the tag
still resolves to the validated commit and verifies release metadata before a
separate package-write job can authenticate to GHCR. The ordinary validation
workflow runs checks, browser tests, and a non-publishing Docker build for
every branch push and pull request. Manual dispatch runs `npm run check` and
Playwright browser tests before the package-write job.

## Release candidate checklist

### Scope and documentation

- [ ] Every required feature for the target version is implemented and its
      acceptance criteria are verified.
- [ ] Deferred behavior and known limitations are explicit in the product and
      operations documentation.
- [ ] `package.json` and workspace package versions match the intended release.
- [ ] `CHANGELOG.md` moves completed entries from `Unreleased` into a dated
      `[VERSION]` section and contains user-facing upgrade notes.
- [ ] Database changes include tested forward migrations. If there are no
      database changes, the release notes state that the current data is kept.

### Automated and manual verification

- [ ] `npm ci` succeeds from a clean checkout.
- [ ] `npm run check` passes, including the deterministic release metadata
      tests.
- [ ] `npm run test:e2e` passes against the production build and an isolated
      temporary SQLite database.
- [ ] `docker build --tag spotter:release-candidate .` succeeds.
- [ ] The container health, PWA, API, mounted-volume persistence, backup, and
      restore smoke tests pass.
- [ ] Browser testing covers install/reopen, offline start/edit/finish,
      reload, reconnect, retry, and exactly-once server synchronization.
- [ ] Browser testing also covers catalogue and template management, exercise
      guide/comments, typed strength and calisthenics inputs, duration/interval
      cardio, previous-set hints, Settings, and the stretching-poster lifecycle.
- [ ] Mobile layout, keyboard operation, labels, focus, and screen-reader
      announcements have been checked.
- [ ] An ordinary branch push has run validation and has not published an
      image.

### Publish and verify

- [ ] The release commit is on `develop`, reviewed, and the worktree is clean.
- [ ] Create an annotated tag only after the checklist is complete:

  ```bash
  git tag -a v1.1.0 -m "Spotter v1.1.0"
  git push origin develop v1.1.0
  ```

- [ ] Confirm the `Publish container` workflow succeeded for the tagged
      commit.
- [ ] Pull the immutable version tag and verify `/api/health`, `/api/version`,
      catalogue data, and workout history against a disposable or backed-up
      volume.
- [ ] Create GitHub release notes from the matching `CHANGELOG.md` section,
      including known limitations and upgrade or migration instructions.
- [ ] Confirm prereleases did not move `latest`; confirm stable releases
      published the expected exact, minor, and `latest` tags.

If publication or smoke verification fails, do not reuse or move the version
tag. Correct the issue, increment the version according to SemVer, and publish
a new tag. Existing installations can keep using the previous immutable image
tag while the problem is investigated.

## Manual image builds

Use `workflow_dispatch` for a deliberate test image that is not a release.
Leave `image_tag` empty for the collision-safe `sha-<commit>` tag, or supply a
valid Docker tag containing at most 128 letters, numbers, periods, underscores,
or hyphens. `latest`, exact Semantic Versions, and minor-version aliases are
reserved for tag-driven releases and are rejected for manual builds.
