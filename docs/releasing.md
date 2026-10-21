# Spotter Release Guide

Spotter releases are deliberate. A pushed, strict Semantic Version tag builds
the production image; ordinary branch pushes and pull requests only validate
the repository. Do not create `v0.1.0` until the product acceptance criteria
and the implementation-plan test matrix have passed.

## Version and image policy

- Release tags use `vMAJOR.MINOR.PATCH`, with an optional SemVer prerelease or
  build suffix. Examples: `v0.1.0` and `v0.2.0-beta.1`.
- A stable `v0.1.0` tag publishes `0.1.0`, `0.1`, and `latest`.
- A prerelease such as `v0.2.0-beta.1` publishes only
  `0.2.0-beta.1`; it does not move `0.2` or `latest`.
- The image receives `APP_VERSION` without the leading `v`, so `/api/version`
  reports `0.1.0` for tag `v0.1.0`.
- A manual workflow run publishes its explicit image tag, or the unique
  `sha-<full-commit>` fallback. Its application version is the package version
  plus `sha` build metadata, such as `0.1.0+sha.0123456789ab`.
- Strings that merely start with `v` but are not valid Semantic Versions fail
  before registry login or image publication.

The release workflow is the only automation that pushes images. The validation
workflow runs `npm run check` and a non-publishing Docker build for every branch
push and pull request.

## Release candidate checklist

### Scope and documentation

- [ ] Every required feature for the target version is implemented and its
      acceptance criteria are verified.
- [ ] Deferred behavior and known limitations are explicit in the product and
      operations documentation.
- [ ] `package.json` and workspace package versions match the intended release.
- [ ] `CHANGELOG.md` moves completed entries from `Unreleased` into a dated
      `[VERSION]` section and contains user-facing upgrade notes.
- [ ] Database changes include tested forward migrations and any compatibility
      or downgrade warning required by the release.

### Automated and manual verification

- [ ] `npm ci` succeeds from a clean checkout.
- [ ] `npm run check` passes, including the deterministic release metadata
      tests.
- [ ] `docker build --tag spotter:release-candidate .` succeeds.
- [ ] The container health, PWA, API, mounted-volume persistence, backup, and
      restore smoke tests pass.
- [ ] Browser testing covers install/reopen, offline start/edit/finish,
      reload, reconnect, retry, and exactly-once server synchronization.
- [ ] Mobile layout, keyboard operation, labels, focus, and screen-reader
      announcements have been checked.
- [ ] An ordinary branch push has run validation and has not published an
      image.

### Publish and verify

- [ ] The release commit is on `develop`, reviewed, and the worktree is clean.
- [ ] Create an annotated tag only after the checklist is complete:

  ```bash
  git tag -a v0.1.0 -m "Spotter v0.1.0"
  git push origin v0.1.0
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
