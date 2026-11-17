/**
 * Checks that `PolycentricClient` fires its events at the right moments.
 */

import { describe, expect, it, vi } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { PolycentricClient, type KeyPair } from './polycentric-client';
import { StorageHandle } from './data-store/storage-handle';
import { COLLECTION } from './constants';
import * as Proto from './proto/v2';
import {
  MemoryFileStoreDriver,
  MemoryStorageDriver,
} from './memory-storage/memory-storage';
import type { LoginId } from './platform-interfaces/login-repository';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Signer {
  privateKey: Uint8Array;
  publicKey: Proto.PublicKey;
}

/** An ed25519 keypair derived from a fixed seed. */
function makeSigner(seed: number): Signer {
  const privateKey = new Uint8Array(32).fill(seed);
  return {
    privateKey,
    publicKey: Proto.PublicKey.create({
      keyType: Proto.KeyType.ED25519,
      key: ed25519.getPublicKey(privateKey),
    }),
  };
}

const IDENTITY = 'ab'.repeat(32);
const signer = makeSigner(1);
const login: LoginId = { identity: IDENTITY, publicKey: signer.publicKey };

/**
 * A core that accepts every call the login and commit paths make.
 * `signEvent` calls back into the client's signer, like the real core does.
 */
function makeCore() {
  return {
    setAuthTokenProvider: vi.fn(),
    clearAuthTokens: vi.fn(),
    setActiveIdentity: vi.fn(),
    setServers: vi.fn(),
    resolveIdentity: vi.fn(() => undefined),
    copyEvents: vi.fn(),
    copyContents: vi.fn(),
    signEvent: vi.fn(
      async (
        eventBytes: ArrayBuffer,
        { sign }: { sign: (bytes: ArrayBuffer) => Promise<ArrayBuffer> },
      ) => {
        const signature = new Uint8Array(await sign(eventBytes));
        return Proto.SignedEvent.toBinary(
          Proto.SignedEvent.create({
            eventBytes: new Uint8Array(eventBytes),
            signature,
          }),
        ).buffer;
      },
    ),
  } as any;
}

/** A client backed by in-memory storage holding one live login. */
async function makeClient() {
  const storageDriver = new MemoryStorageDriver();
  const loginRepository = storageDriver.createLoginRepository();
  await loginRepository.putLogin(
    IDENTITY,
    Proto.KeyType.ED25519,
    signer.publicKey.key,
    signer.privateKey,
    'liveSigningKey',
  );

  const client = new PolycentricClient({
    core: makeCore(),
    storageDriver,
    filestoreDriver: new MemoryFileStoreDriver(),
  });
  (client as any).storageHandle = new StorageHandle({
    eventRepository: storageDriver.createEventRepository(),
    loginRepository,
  });
  return client;
}

function makeContent(text: string): Proto.Content {
  return Proto.Content.create({
    contentBody: { oneofKind: 'post', post: Proto.Post.create({ text }) },
  });
}

/** An unsigned feed event by `signer` carrying `content`. */
function makeEvent(content: Proto.Content, sequence = 1) {
  const contentBytes = Proto.Content.toBinary(content);
  const eventKey = Proto.EventKey.create({
    collection: COLLECTION.FEED,
    identity: IDENTITY,
    signedBy: signer.publicKey,
    sequence: BigInt(sequence),
  });
  const event = Proto.Event.create({
    key: eventKey,
    identitySequence: 1n,
    previousSignature: new Uint8Array(),
    previousRoot: new Uint8Array(),
    contentDigest: Proto.ContentDigest.create({
      type: Proto.ContentDigestType.SHA256,
      value: sha256(contentBytes),
    }),
    createdAt: 1_700_000_000_000n,
  });
  return { event, eventKey, contentBytes };
}

function signedEventOf(event: Proto.Event): Proto.SignedEvent {
  const eventBytes = Proto.Event.toBinary(event);
  return Proto.SignedEvent.create({
    eventBytes,
    signature: ed25519.sign(eventBytes, signer.privateKey),
  });
}

/** The required-field event key that storage indexes events by. */
function storageKeyOf(eventKey: Proto.EventKey) {
  return { ...eventKey, signedBy: signer.publicKey };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PolycentricClient keyPairChanged', () => {
  it('emits the new key pair after logging in', async () => {
    const client = await makeClient();
    const seen: { payload: KeyPair | null; identity: string | null }[] = [];
    client.events.onKeyPairChanged((payload) => {
      seen.push({ payload, identity: client.activeIdentityKey });
    });

    await client.loginAs(login);

    expect(seen).toHaveLength(1);
    expect(seen[0].identity).toBe(IDENTITY);
    expect(seen[0].payload).toBe(client.currentKeyPair);
    expect(seen[0].payload).toEqual({
      keyType: Proto.KeyType.ED25519,
      privateKey: Proto.PrivateKey.create({
        keyType: Proto.KeyType.ED25519,
        key: signer.privateKey,
      }),
      publicKey: signer.publicKey,
    });
  });

  it('emits null after logging out', async () => {
    const client = await makeClient();
    await client.loginAs(login);
    const listener = vi.fn();
    client.events.onKeyPairChanged(listener);

    await client.loginAs(null);

    expect(listener).toHaveBeenCalledExactlyOnceWith(null);
    expect(client.currentKeyPair).toBeNull();
    expect(client.activeIdentityKey).toBeNull();
  });

  it('emits nothing when the login does not exist', async () => {
    const client = await makeClient();
    const listener = vi.fn();
    client.events.onKeyPairChanged(listener);

    const unknown: LoginId = {
      identity: IDENTITY,
      publicKey: makeSigner(2).publicKey,
    };
    await expect(client.loginAs(unknown)).rejects.toThrow('Login not found.');

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('PolycentricClient contentCreated', () => {
  it('commitEvent emits the event and content once it is stored', async () => {
    const client = await makeClient();
    const content = makeContent('hello');
    const { event, eventKey, contentBytes } = makeEvent(content);
    const signedEvent = signedEventOf(event);

    const listener = vi.fn();
    let storedAtEmit: Promise<unknown> | undefined;
    client.events.onContentCreated((payload) => {
      listener(payload);
      storedAtEmit = client.storage.events.get(
        IDENTITY,
        storageKeyOf(eventKey),
      );
    });

    await client.commitEvent({
      owner: IDENTITY,
      signedEvent,
      content,
      contentBytes,
    });

    expect(listener).toHaveBeenCalledExactlyOnceWith({ signedEvent, content });
    expect(await storedAtEmit).toMatchObject({
      eventBytes: signedEvent.eventBytes,
      contentStatus: 'present',
    });
  });

  it('createEvent emits the signed event and content', async () => {
    const client = await makeClient();
    await client.loginAs(login);
    const content = makeContent('created');
    vi.spyOn(client, 'buildEvent').mockResolvedValue(makeEvent(content));
    const listener = vi.fn();
    client.events.onContentCreated(listener);

    const created = await client.createEvent({
      collection: COLLECTION.FEED,
      content,
    });

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      signedEvent: created.signedEvent,
      content,
    });
    expect(
      ed25519.verify(
        created.signedEvent.signature,
        created.signedEvent.eventBytes,
        signer.publicKey.key,
      ),
    ).toBe(true);
  });
});
