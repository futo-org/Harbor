import { describe, expect, it, vi } from 'vitest';

import { PolycentricClient } from './polycentric-client';
import { StorageHandle } from './data-store/storage-handle';
import * as Proto from './proto/v2';
import {
  MemoryFileStoreDriver,
  MemoryStorageDriver,
} from './memory-storage/memory-storage';
import type { EventRow } from './platform-interfaces/event-repository';

const IDENTITY = 'ab'.repeat(32);
const OTHER = 'cd'.repeat(32);
const SERVERS = ['https://a.example', 'https://b.example'];

const publicKey = Proto.PublicKey.create({
  keyType: Proto.KeyType.ED25519,
  key: new Uint8Array(32).fill(1),
});
const privateKey = new Uint8Array(32).fill(2);

function makeRow(owner: string): EventRow {
  return {
    owner,
    eventKey: {
      collection: 1,
      identity: owner,
      signedBy: publicKey,
      sequence: 1n,
    },
    eventBytes: new Uint8Array([1]),
    eventSignature: new Uint8Array([2]),
    contentStatus: 'absent',
  };
}

async function makeClient() {
  const storageDriver = new MemoryStorageDriver();
  const filestoreDriver = new MemoryFileStoreDriver();
  const eventRepository = storageDriver.createEventRepository();
  const loginRepository = storageDriver.createLoginRepository();

  for (const identity of [IDENTITY, OTHER]) {
    await loginRepository.putLogin(
      identity,
      Proto.KeyType.ED25519,
      publicKey.key,
      privateKey,
      'liveRotationKey',
    );
    await eventRepository.insert(makeRow(identity));
    await filestoreDriver.put(`blobs/${identity}/1_aa`, new Uint8Array([3]));
  }
  await filestoreDriver.put('1_aa', new Uint8Array([3]));

  const client = new PolycentricClient({
    core: {
      setAuthTokenProvider: vi.fn(),
      clearAuthTokens: vi.fn(),
      setActiveIdentity: vi.fn(),
      setServers: vi.fn(),
      resolveIdentity: vi.fn(() => undefined),
      copyEvents: vi.fn(),
      copyContents: vi.fn(),
      deleteIdentity: vi.fn(async () => undefined),
      resolveIdentityChain: vi.fn(
        () =>
          Proto.ListEventsResponse.toBinary(Proto.ListEventsResponse.create())
            .buffer,
      ),
      setDevicePushSubscriptions: vi.fn(async () => new ArrayBuffer(0)),
    } as any,
    storageDriver,
    filestoreDriver,
    seedServers: SERVERS,
  });
  (client as any).storageHandle = new StorageHandle({
    eventRepository,
    loginRepository,
  });
  await client.loginAs({ identity: IDENTITY, publicKey });

  return { client, storageDriver, filestoreDriver };
}

describe('deleteLocalIdentity', () => {
  it('logs out and erases only that identity', async () => {
    const { client, storageDriver, filestoreDriver } = await makeClient();
    const keyPairChanged = vi.fn();
    client.events.onKeyPairChanged(keyPairChanged);

    await client.deleteLocalIdentity(IDENTITY);

    expect(client.activeIdentityKey).toBeNull();
    expect(client.currentKeyPair).toBeNull();
    expect(keyPairChanged).toHaveBeenCalledWith(null);
    expect(await storageDriver.getActiveLogin()).toBeNull();

    expect(await client.storage.logins.listLogins(IDENTITY)).toEqual([]);
    expect(await client.storage.events.getAll(IDENTITY)).toEqual([]);
    expect(await filestoreDriver.list(`blobs/${IDENTITY}`)).toBeNull();
    expect(await filestoreDriver.has('1_aa')).toBe(false);

    expect(await client.storage.logins.listLogins(OTHER)).toHaveLength(1);
    expect(await client.storage.events.getAll(OTHER)).toHaveLength(1);
    expect(await filestoreDriver.has(`blobs/${OTHER}/1_aa`)).toBe(true);
  });

  it('can run again after it already finished', async () => {
    const { client } = await makeClient();

    await client.deleteLocalIdentity(IDENTITY);
    await expect(client.deleteLocalIdentity(IDENTITY)).resolves.toBeUndefined();
  });
});

describe('deleteRemoteIdentity', () => {
  it('asks each server and keeps going past a failure', async () => {
    const { client } = await makeClient();
    const request = client.core.deleteIdentity as ReturnType<typeof vi.fn>;
    request.mockImplementation(async (server: string) => {
      if (server === SERVERS[1]) throw new Error('offline');
    });
    // Suppress the console error that we expect from cluttering the output
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const results = await client.deleteRemoteIdentity();

    expect(request.mock.calls).toEqual(SERVERS.map((server) => [server]));
    expect(results).toEqual([
      { server: SERVERS[0], deleted: true },
      { server: SERVERS[1], deleted: false, error: expect.any(Error) },
    ]);

    error.mockRestore();
  });

  it('includes servers the identity listed in the past', async () => {
    const { client } = await makeClient();
    const identityBundle = (urls: string[]) =>
      Proto.EventBundle.create({
        serializedContent: {
          contentBytes: Proto.Content.toBinary(
            Proto.Content.create({
              contentBody: {
                oneofKind: 'identity',
                identity: Proto.Identity.create({ servers: { urls } }),
              },
            }),
          ),
        },
      });
    vi.spyOn(client, 'resolveIdentityChain').mockReturnValue([
      identityBundle(['https://old.example', SERVERS[0]!]),
      identityBundle(SERVERS),
    ]);

    expect(client.identityServerHistory()).toEqual([
      ...SERVERS,
      'https://old.example',
    ]);

    const results = await client.deleteRemoteIdentity();
    expect(results.map((result) => result.server)).toEqual([
      ...SERVERS,
      'https://old.example',
    ]);
  });

  it('requires an active identity', async () => {
    const { client } = await makeClient();
    await client.loginAs(null);

    await expect(client.deleteRemoteIdentity()).rejects.toThrow(
      'No active identity',
    );
  });
});

describe('clearDevicePushSubscriptions', () => {
  it('sends an empty subscription list for the target to each server', async () => {
    const { client } = await makeClient();
    const send = client.core.setDevicePushSubscriptions as ReturnType<
      typeof vi.fn
    >;
    send.mockRejectedValueOnce(new Error('offline'));
    // Suppress the console error that we expect from cluttering the output
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await client.clearDevicePushSubscriptions(SERVERS, {
      service: 'expo',
      token: 'token',
    });

    expect(send.mock.calls.map(([server]) => server)).toEqual(SERVERS);
    const request = Proto.SetDevicePushSubscriptionsRequest.fromBinary(
      new Uint8Array(send.mock.calls[1]![1]),
    );
    expect(request.pushTarget).toEqual({ service: 'expo', token: 'token' });
    expect(request.subscriptions).toEqual([]);

    error.mockRestore();
  });
});
