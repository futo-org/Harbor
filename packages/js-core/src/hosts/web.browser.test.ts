import {
  type Content,
  ContentBody,
  type EventBundle,
  Post,
} from '@polycentric/rs-core-wasm/web';
import { describe, expect, it } from 'vitest';
import { COLLECTION } from '../constants';
import { createWebClient } from './web';

const post = (text: string): Content => ({
  contentBody: new ContentBody.Post({ post: Post.create({ text }) }),
});

const texts = (bundles: EventBundle[]) =>
  bundles
    .map((b) => {
      const body = b.serializedContent?.content?.contentBody;
      return body && ContentBody.Post.instanceOf(body)
        ? body.inner.post.text
        : '';
    })
    .sort();

describe('web host', () => {
  it('runs one client in a worker for every tab', async () => {
    const databaseName = `test-${crypto.randomUUID()}`;
    const seedServers = ['http://127.0.0.1:9'];

    // The first client leads: its tab runs the worker (OPFS + WebCrypto).
    const a = await createWebClient({ databaseName, seedServers });
    expect(a.persistentStorage).toBe(true);
    expect(a.activeIdentityKey).toBeNull();

    // A second client (another tab) talks to the same worker.
    const b = await createWebClient({ databaseName, seedServers });
    const bSignedIn = new Promise<void>((resolve) =>
      b.subscribe(() => {
        if (b.activeIdentityKey) resolve();
      }),
    );

    const login = await a.createIdentity();
    expect(a.activeIdentityKey).toBe(login.identity);
    // State changes reach every tab.
    await bSignedIn;
    expect(b.activeIdentityKey).toBe(login.identity);

    const committed = new Promise<EventBundle>((resolve) =>
      b.on('committed', resolve),
    );
    await a.publish(post('hello from a'));
    expect(texts([await committed])).toEqual(['hello from a']);

    // Both tabs write through the one client: sequences can't fork.
    const pending = await b.prepareEvent(post('prepared by b'));
    await a.publish(post('a again'));
    await expect(b.commitEvent(pending)).rejects.toThrow();
    await b.publish(post('hello from b'));

    const feed = await b.listValidEvents(login.identity, COLLECTION.FEED);
    expect(texts(feed)).toEqual(['a again', 'hello from a', 'hello from b']);
    expect(feed.map((x) => x.signedEvent?.event?.key?.sequence).sort()).toEqual(
      [1n, 2n, 3n],
    );

    const { digest } = await a.commitBlob(
      new Uint8Array([1, 2, 3]),
      'image/png',
    );
    if (!digest) throw new Error('blob has no digest');
    expect(
      new Uint8Array((await b.getBlob(digest)) ?? new ArrayBuffer(0)),
    ).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('seals keys with a key the page never sees', async () => {
    const databaseName = `test-${crypto.randomUUID()}`;
    const client = await createWebClient({ databaseName });
    await client.createIdentity();
    // The wrapping key is a non-extractable CryptoKey in IndexedDB.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('harbor-keys');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const key = await new Promise<CryptoKey>((resolve, reject) => {
      const get = db.transaction('keys').objectStore('keys').get(databaseName);
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });
});
