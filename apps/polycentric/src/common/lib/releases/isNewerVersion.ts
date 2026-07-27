interface ReleaseVersion {
  core: [number, number, number];
  alpha: number | null;
}

const RELEASE_VERSION_PATTERN =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-alpha\.(0|[1-9]\d*))?$/;

function parseReleaseVersion(version: string): ReleaseVersion | null {
  const match = RELEASE_VERSION_PATTERN.exec(version);
  if (!match) return null;

  const core = match.slice(1, 4).map(Number);
  const alpha = match[4] === undefined ? null : Number(match[4]);
  if (
    !core.every(Number.isSafeInteger) ||
    (alpha !== null && !Number.isSafeInteger(alpha))
  ) {
    return null;
  }

  return {
    core: [core[0], core[1], core[2]],
    alpha,
  };
}

export function isNewerVersion(latest: string, current: string): boolean {
  const latestVersion = parseReleaseVersion(latest);
  const currentVersion = parseReleaseVersion(current);
  if (!latestVersion || !currentVersion) return false;

  for (let i = 0; i < latestVersion.core.length; i++) {
    if (latestVersion.core[i] !== currentVersion.core[i]) {
      return latestVersion.core[i] > currentVersion.core[i];
    }
  }

  if (latestVersion.alpha === null) return currentVersion.alpha !== null;
  if (currentVersion.alpha === null) return false;
  return latestVersion.alpha > currentVersion.alpha;
}
