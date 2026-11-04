import { type Content, ContentBody, Post } from '@polycentric/rs-core-wasm/web';
import { describe, expect, it } from 'vitest';
import { COLLECTION } from '../constants';
import { hexToBytes } from '../utils/hex';
import fixture from './fixtures/legacy-identity.json';
import { createWebClient } from './web';

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

const bytes = (hex: string) => hexToBytes(hex) ?? new Uint8Array();

/**
 * Write the fixture (a genesis identity event, its content and key, made by
 * rs-core with a fixed seed) in the layout the old js-browser IndexedDB
 * driver used.
 */
async function writeOldDatabase(name: string): Promise<void> {
  const open = indexedDB.open(name, 5);
  open.onupgradeneeded = () => {
    const db = open.result;
    db.createObjectStore('events', {
      keyPath: ['identity', 'publicKey', 'collection', 'sequence'],
    });
    db.createObjectStore('content', { keyPath: 'digestHex' });
    db.createObjectStore('logins', {
      keyPath: ['identity', 'keyType', 'publicKeyHex'],
    });
    db.createObjectStore('loginState', { keyPath: 'name' });
  };
  const db = await request(open);
  const tx = db.transaction(
    ['events', 'content', 'logins', 'loginState'],
    'readwrite',
  );
  tx.objectStore('events').put({
    identity: fixture.identity,
    publicKey: fixture.publicKey,
    collection: COLLECTION.IDENTITY,
    sequence: 1,
    signature: bytes(fixture.signature),
    eventBytes: bytes(fixture.eventBytes),
  });
  tx.objectStore('content').put({
    digestHex: 'unused',
    contentBytes: bytes(fixture.content),
  });
  tx.objectStore('logins').put({
    identity: fixture.identity,
    keyType: 1,
    publicKeyHex: fixture.publicKey,
    status: 'liveRotationKey',
    privateKeyLocation: 'inline',
    privateKeyHex: fixture.privateKey,
  });
  tx.objectStore('loginState').put({
    name: 'activeLogin',
    identity: fixture.identity,
    publicKey: { keyType: 1, key: bytes(fixture.publicKey) },
  });
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

const post = (text: string): Content => ({
  contentBody: new ContentBody.Post({ post: Post.create({ text }) }),
});

describe('web migration', () => {
  it('imports data from the old IndexedDB and OPFS stores', async () => {
    const name = `migrate-${crypto.randomUUID()}`;
    await writeOldDatabase(name);

    // An old blob in OPFS.
    const root = await navigator.storage.getDirectory();
    const blobs = await root.getDirectoryHandle(`${name}-blobs`, {
      create: true,
    });
    const file = await blobs.getFileHandle('1_old', { create: true });
    const writable = await file.createWritable();
    await writable.write(new Uint8Array([9, 8, 7]));
    await writable.close();

    const client = await createWebClient({
      databaseName: name,
      seedServers: ['http://127.0.0.1:9'],
    });
    expect(client.activeIdentityKey).toBe(fixture.identity);
    const chain = await client.resolveIdentityChain(fixture.identity);
    expect(chain).toHaveLength(1);

    // Signing works with the migrated (now sealed) key.
    await client.publish(post('new post'));
    expect(
      await client.listValidEvents(fixture.identity, COLLECTION.FEED),
    ).toHaveLength(1);

    // The blob kept its content address.
    const { digest } = await client.commitBlob(
      new Uint8Array([9, 8, 7]),
      'x/y',
    );
    if (!digest) throw new Error('blob has no digest');
    expect(await client.hasBlob(digest)).toBe(true);
  });
});
