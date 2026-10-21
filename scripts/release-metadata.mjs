import { appendFile, readFile } from 'node:fs/promises';

const numericIdentifier = String.raw`(?:0|[1-9]\d*)`;
const prereleaseIdentifier = String.raw`(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)`;
const semverPattern = new RegExp(
  String.raw`^(${numericIdentifier})\.(${numericIdentifier})\.(${numericIdentifier})(?:-(${prereleaseIdentifier}(?:\.${prereleaseIdentifier})*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$`,
);
const dockerTagPattern = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
const minorImageTagPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const commitPattern = /^[0-9a-f]{7,64}$/i;

export function parseSemver(version) {
  const match = semverPattern.exec(version);
  if (!match) {
    throw new Error(`Invalid semantic version: ${version}`);
  }

  return {
    version,
    prerelease: match[4] ?? null,
    build: match[5] ?? null,
    precedenceVersion: version.split('+', 1)[0],
  };
}

export function resolveReleaseMetadata({
  eventName,
  refName,
  sha,
  manualImageTag = '',
  packageVersion,
}) {
  if (!commitPattern.test(sha)) {
    throw new Error('Commit must be a 7-64 character hexadecimal SHA.');
  }

  if (eventName === 'push') {
    if (!refName.startsWith('v')) {
      throw new Error('Release tags must start with v.');
    }

    const parsed = parseSemver(refName.slice(1));
    const parsedPackageVersion = parseSemver(packageVersion);
    if (parsed.precedenceVersion !== parsedPackageVersion.precedenceVersion) {
      throw new Error(
        `Release ${parsed.precedenceVersion} does not match package version ${parsedPackageVersion.precedenceVersion}.`,
      );
    }
    return {
      appVersion: parsed.version,
      imageTag: '',
      isPrerelease: parsed.prerelease !== null,
      releaseVersion: parsed.version,
    };
  }

  if (eventName === 'workflow_dispatch') {
    const parsed = parseSemver(packageVersion);
    const shortSha = sha.toLowerCase().slice(0, 12);
    const buildIdentifiers = [parsed.build, 'sha', shortSha].filter(Boolean);
    const appVersion = `${parsed.precedenceVersion}+${buildIdentifiers.join('.')}`;
    const imageTag = manualImageTag.trim() || `sha-${sha.toLowerCase()}`;

    if (!dockerTagPattern.test(imageTag)) {
      throw new Error(
        `Invalid manual image tag: ${imageTag}. Use at most 128 letters, numbers, periods, underscores, or hyphens.`,
      );
    }
    if (
      imageTag === 'latest' ||
      minorImageTagPattern.test(imageTag) ||
      semverPattern.test(imageTag)
    ) {
      throw new Error(
        `Manual image tag ${imageTag} is reserved for tag-driven releases.`,
      );
    }

    return {
      appVersion,
      imageTag,
      isPrerelease: false,
      releaseVersion: '',
    };
  }

  throw new Error(`Unsupported release event: ${eventName}`);
}

async function main() {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const metadata = resolveReleaseMetadata({
    eventName: process.env.RELEASE_EVENT_NAME ?? '',
    refName: process.env.RELEASE_REF_NAME ?? '',
    sha: process.env.RELEASE_SHA ?? '',
    manualImageTag: process.env.RELEASE_MANUAL_IMAGE_TAG ?? '',
    packageVersion: packageJson.version,
  });
  const output = [
    `app_version=${metadata.appVersion}`,
    `image_tag=${metadata.imageTag}`,
    `is_prerelease=${String(metadata.isPrerelease)}`,
    `release_version=${metadata.releaseVersion}`,
  ].join('\n');

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `${output}\n`);
  } else {
    process.stdout.write(`${output}\n`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], 'file:').href
) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
