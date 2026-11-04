import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BackupCheck,
  ClientState,
  type Content,
  ContentBody,
  ContentDigestType,
  Post,
  Query,
  QueryData,
  type QueryResult,
  QueryStatus,
  SyncStrategy,
} from '@polycentric/rs-core-wasm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COLLECTION } from '../constants';
import { AlreadyExistsError, ServerAlreadyAddedError } from '../errors';
import { generateWrappingKey } from '../local';
import { createNodeClient, initNodeBindings } from './node';

// Runs against the real rs-core wasm (`pnpm --filter
// @polycentric/rs-core-wasm build`).

const DEAD_SERVER = 'http://127.0.0.1:9';
const dir = mkdtempSync(join(tmpdir(), 'js-core-node-'));
beforeAll(initNodeBindings);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const post = (text: string): Content => ({
  contentBody: new ContentBody.Post({ post: Post.create({ text }) }),
});

const textOf = (content: Content | undefined) =>
  content?.contentBody && ContentBody.Post.instanceOf(content.contentBody)
    ? content.contentBody.inner.post.text
    : undefined;

describe('node host', () => {
  it('persists to a SQLite file, sealed, and restores the login', async () => {
    const databasePath = join(dir, 'state', 'db.sqlite');
    const wrappingKey = generateWrappingKey();
    await expect(createNodeClient({ databasePath })).rejects.toThrow(
      /wrapping key/,
    );

    const a = await createNodeClient({
      databasePath,
      wrappingKey,
      seedServers: [DEAD_SERVER],
    });
    expect(a.persistentStorage).toBe(true);
    expect(a.snapshot.state).toBe(ClientState.Ready);

    let snapshots = 0;
    a.subscribe(() => snapshots++);
    const login = await a.createIdentity();
    expect(a.activeIdentityKey).toBe(login.identity);
    expect(a.activePublicKey).toEqual(login.publicKey);
    expect(snapshots).toBeGreaterThan(0);

    const committed: string[] = [];
    a.on('committed', (bundle) =>
      committed.push(
        textOf(bundle.serializedContent?.content) ?? '(not a post)',
      ),
    );

    // Show an event before storing it, then store it.
    const pending = await a.prepareEvent(post('prepared'));
    expect(pending.key.identity).toBe(login.identity);
    expect(textOf(pending.bundle.serializedContent?.content)).toBe('prepared');
    await a.commitEvent(pending);
    await expect(a.commitEvent(pending)).rejects.toBeInstanceOf(
      AlreadyExistsError,
    );

    const published = await a.publish(post('published'));
    expect(published.signedEvent?.event?.key?.sequence).toBe(2n);
    expect(committed).toEqual(['prepared', 'published']);

    const pushResults = new Promise((resolve) => a.on('pushResults', resolve));
    await a.sync(SyncStrategy.PartialPush);
    expect(await pushResults).toHaveLength(1);

    const state = await a.resolveIdentity();
    expect(state?.servers).toEqual([DEAD_SERVER]);
    await expect(a.addServer(DEAD_SERVER)).rejects.toBeInstanceOf(
      ServerAlreadyAddedError,
    );

    const backup = await a.createBackup();
    expect(await a.checkBackup(backup)).toBe(BackupCheck.Valid);

    // A second client on the same file: the login comes back only with the
    // same wrapping key.
    const b = await createNodeClient({
      databasePath,
      wrappingKey,
      seedServers: [DEAD_SERVER],
    });
    expect(b.activeIdentityKey).toBe(login.identity);
    const texts = (await b.listValidEvents(login.identity, COLLECTION.FEED))
      .map((bundle) => textOf(bundle.serializedContent?.content))
      .sort();
    expect(texts).toEqual(['prepared', 'published']);

    const wrongKey = await createNodeClient({
      databasePath,
      wrappingKey: generateWrappingKey(),
    });
    expect(wrongKey.activeIdentityKey).toBeNull();
  });

  it('runs in memory without a path, and streams query results', async () => {
    const client = await createNodeClient({ seedServers: [DEAD_SERVER] });
    expect(client.persistentStorage).toBe(false);
    await client.createIdentity();

    const results: QueryResult[] = [];
    const done = new Promise<void>((resolve) => {
      const stop = client
        .fetchQuery(
          ['profile'],
          new Query.GetProfile({ identity: client.activeIdentityKey ?? '' }),
        )
        .subscribe({
          next: (result) => {
            results.push(result);
            if (result.status !== QueryStatus.Loading) {
              stop();
              resolve();
            }
          },
          error: () => {},
          complete: () => resolve(),
        });
    });
    await done;
    const last = results.at(-1);
    expect(last).toBeDefined();
    if (last?.data) {
      expect(QueryData.Profile.instanceOf(last.data)).toBe(true);
    }
    const digest = {
      type: ContentDigestType.Sha256,
      value: new Uint8Array(32).buffer,
    };
    expect(client.blobUrls(digest)).toEqual([
      `${DEAD_SERVER}/blob/1_${'0'.repeat(64)}`,
    ]);
  });
});
