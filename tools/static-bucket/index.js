// Uploads to the static S3 bucket, signed by curl (--aws-sigv4). No npm
// dependencies: CI scripts import this from a bare checkout.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function requireEnv(env, name) {
  const value = env[name];
  if (!value) {
    console.error(`missing required env var ${name}`);
    process.exit(1);
  }
  return value;
}

// curl signs the path exactly as given, while S3 canonicalises it with
// everything outside RFC 3986 unreserved escaped, so keys holding e.g. the
// `@` and `+` of pnpm directory names must be encoded here or the
// signature will not match.
function encodeKey(key) {
  return key
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join('/');
}

/**
 * Bucket client configured from STATIC_S3_ENDPOINT, STATIC_S3_BUCKET,
 * STATIC_S3_ACCESS_KEY_ID, STATIC_S3_SECRET_ACCESS_KEY and the optional
 * STATIC_S3_REGION (defaults to "auto").
 */
export function createStaticBucket(env = process.env) {
  const endpoint = requireEnv(env, 'STATIC_S3_ENDPOINT').replace(/\/$/, '');
  const bucket = requireEnv(env, 'STATIC_S3_BUCKET');
  const accessKeyId = requireEnv(env, 'STATIC_S3_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv(env, 'STATIC_S3_SECRET_ACCESS_KEY');
  const region = env.STATIC_S3_REGION || 'auto';

  function put(key, file, contentType, cacheControl) {
    if (!cacheControl) {
      throw new Error(`no cache-control given for ${key}`);
    }
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
        `${endpoint}/${bucket}/${encodeKey(key)}`,
      ],
      {
        input: `user = "${accessKeyId}:${secretAccessKey}"\n`,
        stdio: ['pipe', 'inherit', 'inherit'],
      },
    );
  }

  return { put };
}
