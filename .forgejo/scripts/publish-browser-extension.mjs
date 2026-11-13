// Publish the browser extension builds and their manifest to the static
// bucket, for each of chrome, edge, firefox and safari:
//   browser-extension/<channel>/harbor-anywhere-v<version>-<browser>.zip  (immutable)
//   browser-extension/<channel>/harbor-anywhere-latest-<browser>.zip      (stable download link)
//   browser-extension/<channel>/latest.json
//
// Reads apps/harbor-browser-extension/dist from earlier jobs' artifacts: the
// store zips, and the macOS app wrapping the Safari build when that job
// made one.
//
// Env: UPDATE_CHANNEL (staging|production), STATIC_PUBLIC_BASE_URL, and
// the STATIC_S3_* variables read by tools/static-bucket.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createStaticBucket } from '../../tools/static-bucket/index.js';

const channel = process.env.UPDATE_CHANNEL;
if (channel !== 'staging' && channel !== 'production') {
  console.error(`UPDATE_CHANNEL must be staging or production, got ${channel}`);
  process.exit(1);
}
const publicBaseUrl = process.env.STATIC_PUBLIC_BASE_URL?.replace(/\/$/, '');
if (!publicBaseUrl) {
  console.error('missing required env var STATIC_PUBLIC_BASE_URL');
  process.exit(1);
}

const bucket = createStaticBucket();

const dist = 'apps/harbor-browser-extension/dist';
const STORE_ZIP = /^harbor-browser-extension-(.+)-(chrome|edge|firefox)\.zip$/;
const builds = readdirSync(dist).flatMap((name) => {
  const [, version, browser] = name.match(STORE_ZIP) ?? [];
  return browser ? [{ browser, version, file: `${dist}/${name}` }] : [];
});
const version = builds[0]?.version;
if (!version || builds.some((build) => build.version !== version)) {
  console.error(`could not read one version from the zips in ${dist}`);
  process.exit(1);
}
// Safari only loads the extension from inside the app.
const safariApp = `${dist}/harbor-browser-extension-safari.zip`;
if (existsSync(safariApp)) {
  builds.push({ browser: 'safari', version, file: safariApp });
}

const prefix = `browser-extension/${channel}/harbor-anywhere`;
const manifest = {
  channel,
  version,
  builds: Object.fromEntries(
    builds.map(({ browser, file }) => [
      browser,
      {
        url: `${publicBaseUrl}/${prefix}-v${version}-${browser}.zip`,
        sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
      },
    ]),
  ),
  publishedAt: new Date().toISOString(),
};
writeFileSync('latest.json', `${JSON.stringify(manifest, null, 2)}\n`);

for (const { browser, file } of builds) {
  await bucket.put(
    `${prefix}-v${version}-${browser}.zip`,
    file,
    'application/zip',
    'public, max-age=31536000, immutable',
  );
  await bucket.put(
    `${prefix}-latest-${browser}.zip`,
    file,
    'application/zip',
    'public, max-age=300',
  );
}
// Manifest goes last so it never points at a build that isn't there yet.
await bucket.put(
  `browser-extension/${channel}/latest.json`,
  'latest.json',
  'application/json',
  'public, max-age=300',
);

console.log(`published ${builds.length} builds of ${version} to ${prefix}`);
