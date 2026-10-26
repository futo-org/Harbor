// Pushes apps/harbor/marketing to Google Play.
//
//   node .forgejo/scripts/publish-play-listing.mjs [--dry-run] [--skip-images]
//
// Env: PLAY_SERVICE_ACCOUNT_JSON (service account key file contents).

import { createHash, createSign } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');

const marketing = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../apps/harbor/marketing',
);
const listing = JSON.parse(
  readFileSync(path.join(marketing, 'play-store/listing.json'), 'utf8'),
);

const accountJson = process.env.PLAY_SERVICE_ACCOUNT_JSON;
if (!accountJson) {
  console.error('missing required env var PLAY_SERVICE_ACCOUNT_JSON');
  process.exit(1);
}
const account = JSON.parse(accountJson);

// Client

async function accessToken() {
  const b64 = (value) => Buffer.from(value).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64(
    JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: account.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${payload}`)
    .sign(account.private_key);
  const res = await fetch(account.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${payload}.${b64(signature)}`,
    }),
  });
  const json = await res.json();
  if (!res.ok)
    throw new Error(`token -> ${res.status} ${JSON.stringify(json)}`);
  return json.access_token;
}

const bearer = await accessToken();
const BASE = 'https://androidpublisher.googleapis.com';
const app = `/androidpublisher/v3/applications/${listing.packageName}`;

async function request(method, route, body, contentType = 'application/json') {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': contentType },
    body:
      contentType === 'application/json' ? body && JSON.stringify(body) : body,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(
      `${method} ${route} -> ${res.status} ${JSON.stringify(json?.error ?? json)}`,
    );
  }
  return json;
}

const get = (route) => request('GET', route);
const put = (route, body) => request('PUT', route, body);
const post = (route, body) => request('POST', route, body);
const remove = (route) => request('DELETE', route);

// Helpers

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function pngFiles(rel) {
  const target = path.join(marketing, rel);
  if (!statSync(target).isDirectory()) return [target];
  return readdirSync(target)
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => path.join(target, f));
}

// Steps

async function pushListing(edit) {
  const lang = listing.language;
  await put(`${edit}/listings/${lang}`, {
    language: lang,
    title: listing.title,
    shortDescription: listing.shortDescription,
    fullDescription: listing.fullDescription,
  });
  console.log(`listing text staged`);

  await put(`${edit}/details`, {
    defaultLanguage: listing.defaultLanguage,
    contactEmail: listing.contactEmail,
    contactWebsite: listing.contactWebsite,
    ...(listing.contactPhone ? { contactPhone: listing.contactPhone } : {}),
  });
  console.log('contact details staged');
}

async function pushImages(edit) {
  const lang = listing.language;
  for (const [imageType, rel] of Object.entries(listing.images)) {
    const route = `${edit}/listings/${lang}/${imageType}`;
    const files = pngFiles(rel);
    const wanted = files.map((f) => sha256(readFileSync(f)));
    const existing = (await get(route)).images ?? [];
    if (existing.map((i) => i.sha256).join() === wanted.join()) {
      console.log(`${imageType}: ${files.length} images current`);
      continue;
    }
    console.log(
      `${imageType}: replacing ${existing.length} with ${files.length}`,
    );
    if (existing.length) await remove(route);
    for (const file of files) {
      await request(
        'POST',
        `/upload${route}?uploadType=media`,
        readFileSync(file),
        'image/png',
      );
    }
  }
}

async function pushDataSafety() {
  const csv = path.join(marketing, listing.dataSafetyCsv);
  if (dryRun) {
    console.log(`[dry-run] POST ${app}/dataSafety ${listing.dataSafetyCsv}`);
    return;
  }
  await post(`${app}/dataSafety`, { safetyLabels: readFileSync(csv, 'utf8') });
  console.log('data safety form updated');
}

// Main

const { id } = await post(`${app}/edits`);
const edit = `${app}/edits/${id}`;
try {
  await pushListing(edit);
  if (!args.has('--skip-images')) await pushImages(edit);
  await post(`${edit}:validate`);
  if (dryRun) {
    await remove(edit);
    console.log('Dry run complete, edit discarded');
  } else {
    await post(`${edit}:commit`);
    console.log('Google Play listing updated');
  }
} catch (error) {
  await remove(edit).catch(() => {});
  throw error;
}

await pushDataSafety();
