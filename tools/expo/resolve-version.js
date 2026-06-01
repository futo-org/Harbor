#!/usr/bin/env node
// Resolves the app version for EAS builds and prints it to stdout.
//
//   * On a SemVer release tag (e.g. v2.0.0-alpha.1) -> that version
//     (2.0.0-alpha.1).
//   * Otherwise -> the latest GitLab release version with the patch bumped
//     (e.g. latest 2.0.0 -> 2.0.1), so develop/MR builds sit one patch ahead
//     of the last release.
//
// Reads CI_COMMIT_TAG, CI_API_V4_URL, CI_PROJECT_ID and CI_JOB_TOKEN.

const tag = process.env.CI_COMMIT_TAG || '';
const tagMatch = tag.match(/^v(\d+\.\d+\.\d+.*)$/);

if (tagMatch) {
  process.stdout.write(tagMatch[1]);
} else {
  const api = process.env.CI_API_V4_URL;
  const projectId = process.env.CI_PROJECT_ID;
  const token = process.env.CI_JOB_TOKEN;

  const bumpPatch = (version) => {
    const core = String(version).replace(/^v/, '').split('-')[0];
    const [major = '0', minor = '0', patch = '0'] = core.split('.');
    return `${major}.${minor}.${Number(patch) + 1}`;
  };

  (async () => {
    let latest = '0.0.0';
    try {
      const res = await fetch(
        `${api}/projects/${projectId}/releases?per_page=1`,
        { headers: { 'JOB-TOKEN': token } },
      );
      if (res.ok) {
        const releases = await res.json();
        if (Array.isArray(releases) && releases[0]) {
          latest = releases[0].tag_name || releases[0].name || latest;
        }
      }
    } catch {
      // Fall back to the default below.
    }
    process.stdout.write(bumpPatch(latest));
  })();
}
