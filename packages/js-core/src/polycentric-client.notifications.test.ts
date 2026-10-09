import { afterEach, describe, expect, it, vi } from 'vitest';
import { PolycentricClient } from './polycentric-client';
import * as Proto from './proto/v2';

const lastSeen = Proto.EventKey.create({
  collection: 5,
  identity: 'alice',
  signedBy: { keyType: Proto.KeyType.ED25519, key: new Uint8Array([1, 2]) },
  sequence: 7n,
});

/** A client whose core only knows how to acknowledge, over two servers. */
function makeClient(
  acknowledgeNotifications: (
    server: string,
    request: ArrayBuffer,
  ) => Promise<void>,
) {
  const core = {
    setAuthTokenProvider: vi.fn(),
    acknowledgeNotifications: vi.fn(acknowledgeNotifications),
  } as any;
  const client = new PolycentricClient({
    core,
    storageDriver: {} as any,
    filestoreDriver: {} as any,
    cryptoManager: {} as any,
  });
  client.servers = ['http://a', 'http://b'];
  return { client, core };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PolycentricClient.acknowledgeNotifications', () => {
  it('sends the last seen key to every configured server', async () => {
    const { client, core } = makeClient(async () => {});

    await client.acknowledgeNotifications(lastSeen);

    const calls = core.acknowledgeNotifications.mock.calls as [
      string,
      ArrayBuffer,
    ][];
    expect(calls.map(([server]) => server)).toEqual(['http://a', 'http://b']);
    for (const [, request] of calls) {
      const decoded = Proto.AcknowledgeNotificationsRequest.fromBinary(
        new Uint8Array(request),
      );
      expect(decoded.lastSeen).toEqual(lastSeen);
    }
  });

  it('logs a failing server and still resolves', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client, core } = makeClient(async (server) => {
      if (server === 'http://a') throw new Error('down');
    });

    await expect(
      client.acknowledgeNotifications(lastSeen),
    ).resolves.toBeUndefined();

    expect(core.acknowledgeNotifications).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toBeInstanceOf(Error);
  });

  it('does nothing without servers', async () => {
    const { client, core } = makeClient(async () => {});
    client.servers = [];

    await client.acknowledgeNotifications(lastSeen);

    expect(core.acknowledgeNotifications).not.toHaveBeenCalled();
  });
});
