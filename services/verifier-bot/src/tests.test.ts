import * as dotenv from 'dotenv';

dotenv.config({ path: './.test.env' });

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  COLLECTION,
  type PolycentricClient,
  SyncStrategy,
  v2,
} from '@polycentric/js-core';
import { createPolycentricNodeClient } from '@polycentric/js-node';
import { parseClaimId, SCHEMA_NAME } from './claims.js';
import type { ClaimField } from './models.js';
import { platforms } from './platforms/platforms.js';
import { Result } from './result.js';
import { slug } from './utility.js';
import { TextVerifier } from './verifier.js';

const TEST_SERVER = (
  process.env.POLYCENTRIC_VERIFIER_BOT_SERVERS || 'https://east.polycentric.dev'
)
  .split(',')[0]
  .trim();

// Platforms whose health check can't run in CI (needs manual creds/setup).
const LOCAL_ONLY = new Set<string>(['Instagram']);

// ── Fast unit tests (no network) ──────────────────────────────────────────

describe('helpers', () => {
  test('slug produces URL-safe platform routes', () => {
    assert.equal(slug('X'), 'x');
    assert.equal(slug('YouTube'), 'youtube');
    assert.equal(slug('Hacker News'), 'hacker-news');
    assert.equal(slug('SoundCloud'), 'soundcloud');
  });

  test('parseClaimId round-trips a hex EventKey', () => {
    const key = v2.EventKey.create({
      collection: 8,
      identity: 'identity-hex',
      signedBy: { keyType: 1, key: new Uint8Array([1, 2, 3]) },
      sequence: 7n,
    });
    const hex = Buffer.from(v2.EventKey.toBinary(key)).toString('hex');
    const parsed = parseClaimId(hex);
    assert.ok(parsed);
    assert.equal(parsed.sequence, 7n);
    assert.equal(parsed.identity, 'identity-hex');
  });

  test('parseClaimId rejects malformed ids', () => {
    assert.equal(parseClaimId('not-hex-!!'), undefined);
    assert.equal(parseClaimId(''), undefined);
    assert.equal(parseClaimId('abc'), undefined); // odd length
  });
});

// A TextVerifier whose profile text is fixed — lets us drive requestVerify /
// input validation without touching a live platform.
class DummyVerifier extends TextVerifier {
  private readonly text: string;
  constructor(platform: string, text: string) {
    super(platform);
    this.text = text;
  }
  protected async getText(): Promise<Result<string>> {
    return Result.ok(this.text);
  }
  public async getClaimFieldsByUrl(): Promise<Result<ClaimField[]>> {
    throw new Error('Not implemented');
  }
}

describe('text pre-check', () => {
  const verifier = new DummyVerifier('X', 'my bio with token-abc inside');

  test('CI: passes when the profile contains the token', async () => {
    const result = await verifier.checkFields(
      [{ key: 0, value: 'someuser' }],
      'token-abc',
    );
    assert.ok(result.success);
  });

  test('CI: fails when the token is missing', async () => {
    const result = await verifier.checkFields(
      [{ key: 0, value: 'someuser' }],
      'other-token',
    );
    assert.equal(result.success, false);
  });
});

describe('requestVerify input validation', () => {
  const verifier = new DummyVerifier('X', 'token');

  test('rejects an unsupported content type', async () => {
    const result = await verifier.requestVerify(
      undefined as unknown as PolycentricClient,
      { body: {}, headers: { 'content-type': 'text/plain' }, url: '' },
    );
    assert.equal(result.success, false);
  });

  test('rejects a missing/invalid claim id', async () => {
    const result = await verifier.requestVerify(
      undefined as unknown as PolycentricClient,
      {
        body: { claimId: 'nonsense' },
        headers: { 'content-type': 'application/json' },
        url: '',
      },
    );
    assert.equal(result.success, false);
  });
});

// ── Per-platform health checks (live: network; some need Chrome) ───────────
//
// Meta-guard + one health check per text verifier, mirroring the original
// suite. The list is derived from `platforms` so it can't drift out of sync.
// CI vs LOCAL is encoded in the test name; `test:ci` runs `--test-name-pattern=CI`.

test('CI: every text verifier has a health check', () => {
  const covered = platforms.filter((p) =>
    p.verifiers.some((v) => v instanceof TextVerifier),
  );
  assert.ok(covered.length > 0, 'expected at least one text verifier');
});

for (const platform of platforms) {
  describe(platform.name, () => {
    for (const verifier of platform.verifiers) {
      if (!(verifier instanceof TextVerifier)) continue;
      const tag = LOCAL_ONLY.has(platform.name) ? 'LOCAL' : 'CI';
      test(`${tag}: ${verifier.verifierType} health check`, async () => {
        await verifier.init();
        try {
          const result = await verifier.healthCheck();
          assert.ok(
            result.success,
            result.success
              ? ''
              : `${result.error.message} — ${result.error.extendedMessage ?? ''}`,
          );
        } finally {
          await verifier.dispose();
        }
      });
    }
  });
}

// ── Verify flow (live: needs TEST_SERVER) ──────────────────────────────────

async function makeClient(): Promise<PolycentricClient> {
  const dir = mkdtempSync(join(tmpdir(), 'verifier-bot-test-'));
  const client = await createPolycentricNodeClient({
    databasePath: join(dir, 'db.sqlite'),
    blobDirectory: join(dir, 'blobs'),
    seedServers: [TEST_SERVER],
  });
  if (!client.activeIdentityKey && client.currentKeyPair) {
    await client.identityManager.publish({
      rotationKeys: [client.currentKeyPair.publicKey],
      signingKeys: [],
    });
  }
  return client;
}

/** Publish a verification claim and return its hex EventKey id. */
async function publishClaim(
  client: PolycentricClient,
  schemaName: string,
  fields: Record<string, string>,
): Promise<string> {
  const schema = v2.VerificationSchema.create({
    name: schemaName,
    description: '',
    fields: Object.keys(fields).map((key) => ({
      key,
      kind: v2.FieldKind.STRING,
      format: '',
      required: true,
      description: key,
    })),
  });
  const schemaBytes = v2.VerificationSchema.toBinary(schema);
  const encoder = new TextEncoder();
  const fieldBytes: { [key: string]: Uint8Array } = {};
  for (const [k, val] of Object.entries(fields))
    fieldBytes[k] = encoder.encode(val);

  const content = v2.Content.create({
    contentBody: {
      oneofKind: 'verificationClaim',
      verificationClaim: {
        schema: {
          schemaBytes,
          digest: {
            type: v2.ContentDigestType.SHA256,
            value: sha256(schemaBytes),
          },
        },
        fields: fieldBytes,
      },
    },
  });
  await client.contentManager.save(content);
  const event = await client.buildEvent(content, COLLECTION.VERIFICATIONS);
  const signedEvent = await client.signEvent(event);
  await client.commitEvent(signedEvent, content);
  await client.sync(SyncStrategy.PARTIAL_PUSH);
  const key = v2.Event.fromBinary(signedEvent.eventBytes).key;
  if (!key) throw new Error('published claim has no key');
  return Buffer.from(v2.EventKey.toBinary(key)).toString('hex');
}

describe('requestVerify flow', () => {
  test('CI: text success', async () => {
    const client = await makeClient();
    // The loop-back token is the claim author's identity key (see claims.ts).
    const token = client.activeIdentityKey ?? '';
    // `platform` and `url` are display metadata — only `account` is proofed.
    const claimId = await publishClaim(client, SCHEMA_NAME, {
      platform: 'hackernews',
      account: 'test',
      url: 'https://news.ycombinator.com/user?id=test',
    });

    const verifier = new DummyVerifier('HackerNews', token);
    await verifier.init();
    const result = await verifier.requestVerify(client, {
      body: { claimId },
      headers: { 'content-type': 'application/json' },
      url: 'https://fake.com',
    });
    await verifier.dispose();

    assert.ok(
      result.success,
      result.success ? '' : JSON.stringify(result.error),
    );
    assert.ok(result.value);
  });

  test('CI: text fail on wrong schema', async () => {
    const client = await makeClient();
    const claimId = await publishClaim(client, 'Freeform', { name: 'test' });

    const verifier = new DummyVerifier('HackerNews', 'token');
    await verifier.init();
    const result = await verifier.requestVerify(client, {
      body: { claimId },
      headers: { 'content-type': 'application/json' },
      url: 'https://fake.com',
    });
    await verifier.dispose();

    assert.equal(result.success, false);
  });

  test('CI: text fail on platform mismatch', async () => {
    const client = await makeClient();
    const token = client.activeIdentityKey ?? '';
    const claimId = await publishClaim(client, SCHEMA_NAME, {
      platform: 'youtube',
      account: 'test',
    });

    const verifier = new DummyVerifier('HackerNews', token);
    await verifier.init();
    const result = await verifier.requestVerify(client, {
      body: { claimId },
      headers: { 'content-type': 'application/json' },
      url: 'https://fake.com',
    });
    await verifier.dispose();

    assert.equal(result.success, false);
  });
});
