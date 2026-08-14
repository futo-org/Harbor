// Publish an APK and its update manifest to the static bucket:
//   apk/<channel>/harbor-v<version>-<code>.apk   (immutable)
//   apk/<channel>/harbor-latest.apk              (stable download link)
//   apk/<channel>/latest.json                    (polled by the app)
//
// Uploads are signed by curl (--aws-sigv4), so this needs no npm packages.
// Reads apps/harbor/{eas-build.json,harbor.apk} and release_notes.md
// (production tags only) from earlier jobs' artifacts.
//
// Env: UPDATE_CHANNEL (staging|production), STATIC_S3_ENDPOINT,
// STATIC_S3_BUCKET, STATIC_S3_ACCESS_KEY_ID, STATIC_S3_SECRET_ACCESS_KEY,
// STATIC_PUBLIC_BASE_URL, [STATIC_S3_REGION].

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`missing required env var ${name}`);
    process.exit(1);
  }
  return value;
}

const channel = requireEnv('UPDATE_CHANNEL');
if (channel !== 'staging' && channel !== 'production') {
  console.error(`UPDATE_CHANNEL must be staging or production, got ${channel}`);
  process.exit(1);
}
const endpoint = requireEnv('STATIC_S3_ENDPOINT').replace(/\/$/, '');
const bucket = requireEnv('STATIC_S3_BUCKET');
const accessKeyId = requireEnv('STATIC_S3_ACCESS_KEY_ID');
const secretAccessKey = requireEnv('STATIC_S3_SECRET_ACCESS_KEY');
const publicBaseUrl = requireEnv('STATIC_PUBLIC_BASE_URL').replace(/\/$/, '');
const region = process.env.STATIC_S3_REGION || 'auto';

function s3put(key, file, contentType, cacheControl) {
  console.log(`uploading ${key}`);
  // curl doesn't hash streamed --upload-file bodies, and R2 rejects
  // requests without x-amz-content-sha256 — provide it so curl signs it.
  const bodySha256 = createHash('sha256')
    .update(readFileSync(file))
    .digest('hex');
  execFileSync(
    'curl',
    [
      '-sS',
      '--fail-with-body',
      '--aws-sigv4',
      `aws:amz:${region}:s3`,
      '--config',
      '-',
      '--upload-file',
      file,
      '--header',
      `content-type: ${contentType}`,
      '--header',
      `cache-control: ${cacheControl}`,
      '--header',
      `x-amz-content-sha256: ${bodySha256}`,
      `${endpoint}/${bucket}/${key}`,
    ],
    {
      input: `user = "${accessKeyId}:${secretAccessKey}"\n`,
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  );
}

// `eas build --json` emits an array of builds.
const easOutput = JSON.parse(
  readFileSync('apps/harbor/eas-build.json', 'utf8'),
);
const build = Array.isArray(easOutput) ? easOutput[0] : easOutput;
const versionName = build?.appVersion;
const versionCode = Number(build?.appBuildVersion);
if (!versionName || !Number.isInteger(versionCode) || versionCode <= 0) {
  console.error(
    `could not read appVersion/appBuildVersion from eas-build.json ` +
      `(got ${build?.appVersion} / ${build?.appBuildVersion})`,
  );
  process.exit(1);
}

const notes = existsSync('release_notes.md')
  ? readFileSync('release_notes.md', 'utf8').trim()
  : `${process.env.CI_COMMIT_SHORT_SHA ?? ''}: ${process.env.CI_COMMIT_TITLE ?? ''}`.trim();

const apkFile = 'apps/harbor/harbor.apk';
const apkKey = `apk/${channel}/harbor-v${versionName}-${versionCode}.apk`;
const latestApkKey = `apk/${channel}/harbor-latest.apk`;
const manifestKey = `apk/${channel}/latest.json`;

const manifest = {
  package:
    channel === 'production'
      ? 'org.futo.polycentric'
      : `org.futo.polycentric.${channel}`,
  channel,
  versionName,
  versionCode,
  url: `${publicBaseUrl}/${apkKey}`,
  sha256: createHash('sha256').update(readFileSync(apkFile)).digest('hex'),
  notes,
  publishedAt: new Date().toISOString(),
};
writeFileSync('latest.json', `${JSON.stringify(manifest, null, 2)}\n`);

const APK_CONTENT_TYPE = 'application/vnd.android.package-archive';

s3put(apkKey, apkFile, APK_CONTENT_TYPE, 'public, max-age=31536000, immutable');
s3put(latestApkKey, apkFile, APK_CONTENT_TYPE, 'public, max-age=300');
// Manifest goes last so it never points at an APK that isn't there yet.
s3put(manifestKey, 'latest.json', 'application/json', 'public, max-age=300');

console.log(`published ${manifest.url}`);
