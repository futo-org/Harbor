// Publish an APK and its update manifest to the static bucket:
//   apk/<channel>/harbor-v<version>-<code>.apk   (immutable)
//   apk/<channel>/harbor-latest.apk              (stable download link)
//   apk/<channel>/latest.json                    (polled by the app)
//
// Reads apps/harbor/{eas-build.json,harbor.apk} and release_notes.md
// (production tags only) from earlier jobs' artifacts.
//
// Env: UPDATE_CHANNEL (staging|production), STATIC_S3_ENDPOINT,
// STATIC_S3_BUCKET, STATIC_S3_ACCESS_KEY_ID, STATIC_S3_SECRET_ACCESS_KEY,
// STATIC_PUBLIC_BASE_URL, [STATIC_S3_REGION].

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const APK_DIR = 'apk';

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
const endpoint = requireEnv('STATIC_S3_ENDPOINT');
const bucket = requireEnv('STATIC_S3_BUCKET');
const accessKeyId = requireEnv('STATIC_S3_ACCESS_KEY_ID');
const secretAccessKey = requireEnv('STATIC_S3_SECRET_ACCESS_KEY');
const publicBaseUrl = requireEnv('STATIC_PUBLIC_BASE_URL').replace(/\/$/, '');

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
  : `Staging build ${process.env.CI_COMMIT_SHORT_SHA ?? ''}: ${process.env.CI_COMMIT_TITLE ?? ''}`.trim();

const apk = readFileSync('apps/harbor/harbor.apk');
const apkKey = `${APK_DIR}/${channel}/harbor-v${versionName}-${versionCode}.apk`;
const latestApkKey = `${APK_DIR}/${channel}/harbor-latest.apk`;

const manifest = {
  package:
    channel === 'staging'
      ? 'org.futo.polycentric.staging'
      : 'org.futo.polycentric',
  channel,
  versionName,
  versionCode,
  url: `${publicBaseUrl}/${apkKey}`,
  sha256: createHash('sha256').update(apk).digest('hex'),
  notes,
  publishedAt: new Date().toISOString(),
};

const s3 = new S3Client({
  endpoint,
  region: process.env.STATIC_S3_REGION || 'auto',
  credentials: { accessKeyId, secretAccessKey },
  // Path-style works across R2, MinIO/rustfs, and AWS.
  forcePathStyle: true,
});

const APK_CONTENT_TYPE = 'application/vnd.android.package-archive';

console.log(`uploading ${apkKey} (${apk.byteLength} bytes)`);
await s3.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: apkKey,
    Body: apk,
    ContentType: APK_CONTENT_TYPE,
    CacheControl: 'public, max-age=31536000, immutable',
  }),
);

console.log(`uploading ${latestApkKey}`);
await s3.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: latestApkKey,
    Body: apk,
    ContentType: APK_CONTENT_TYPE,
    CacheControl: 'public, max-age=300',
  }),
);

// Manifest goes last so it never points at an APK that isn't there yet.
console.log(
  `uploading ${APK_DIR}/${channel}/latest.json (versionCode ${versionCode})`,
);
await s3.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: `${APK_DIR}/${channel}/latest.json`,
    Body: `${JSON.stringify(manifest, null, 2)}\n`,
    ContentType: 'application/json',
    CacheControl: 'public, max-age=300',
  }),
);

console.log(`published ${manifest.url}`);
