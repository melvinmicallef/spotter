import assert from 'node:assert/strict';
import test from 'node:test';

import { parseSemver, resolveReleaseMetadata } from './release-metadata.mjs';

const sha = '0123456789abcdef0123456789abcdef01234567';

test('accepts stable and prerelease SemVer values', () => {
  assert.deepEqual(parseSemver('0.1.0'), {
    version: '0.1.0',
    prerelease: null,
    build: null,
    precedenceVersion: '0.1.0',
  });
  assert.equal(parseSemver('0.2.0-beta.1+build.7').prerelease, 'beta.1');
});

test('rejects malformed semantic versions', () => {
  for (const version of ['v0.1.0', '0.1', '01.2.3', '1.2.3-01', '1.2.3+']) {
    assert.throws(() => parseSemver(version), /Invalid semantic version/);
  }
});

test('normalizes a pushed release tag for the application', () => {
  assert.deepEqual(
    resolveReleaseMetadata({
      eventName: 'push',
      refName: 'v0.2.0-beta.1',
      sha,
      packageVersion: '0.2.0-beta.1',
    }),
    {
      appVersion: '0.2.0-beta.1',
      imageTag: '',
      isPrerelease: true,
      releaseVersion: '0.2.0-beta.1',
    },
  );
});

test('rejects a pushed tag that only resembles a release tag', () => {
  assert.throws(
    () =>
      resolveReleaseMetadata({
        eventName: 'push',
        refName: 'vnext',
        sha,
        packageVersion: '0.1.0',
      }),
    /Invalid semantic version/,
  );
});

test('rejects a release tag that does not match the package version', () => {
  assert.throws(
    () =>
      resolveReleaseMetadata({
        eventName: 'push',
        refName: 'v0.2.0',
        sha,
        packageVersion: '0.1.0',
      }),
    /does not match package version/,
  );
});

test('uses a unique image tag and traceable version for a manual build', () => {
  assert.deepEqual(
    resolveReleaseMetadata({
      eventName: 'workflow_dispatch',
      refName: 'develop',
      sha,
      packageVersion: '0.1.0',
    }),
    {
      appVersion: '0.1.0+sha.0123456789ab',
      imageTag: `sha-${sha}`,
      isPrerelease: false,
      releaseVersion: '',
    },
  );
});

test('validates an explicit manual image tag', () => {
  const metadata = resolveReleaseMetadata({
    eventName: 'workflow_dispatch',
    refName: 'develop',
    sha,
    manualImageTag: 'qa_candidate-1',
    packageVersion: '0.1.0',
  });
  assert.equal(metadata.imageTag, 'qa_candidate-1');

  assert.throws(
    () =>
      resolveReleaseMetadata({
        eventName: 'workflow_dispatch',
        refName: 'develop',
        sha,
        manualImageTag: 'invalid/tag',
        packageVersion: '0.1.0',
      }),
    /Invalid manual image tag/,
  );
});

test('keeps release aliases reserved for pushed tags', () => {
  for (const manualImageTag of ['latest', '0.2', '0.2.0', '0.2.0-beta.1']) {
    assert.throws(
      () =>
        resolveReleaseMetadata({
          eventName: 'workflow_dispatch',
          refName: 'develop',
          sha,
          manualImageTag,
          packageVersion: '0.1.0',
        }),
      /reserved for tag-driven releases/,
    );
  }
});
