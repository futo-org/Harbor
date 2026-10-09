import { afterEach, describe, expect, it, vi } from 'vitest';
import { PolycentricClient } from './polycentric-client';

/** A client whose core only knows how to acknowledge, over two servers. */
function makeClient(
  acknowledgeNotifications: (server: string) => Promise<void>,
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
  it('acknowledges on every configured server', async () => {
    const { client, core } = makeClient(async () => {});

    await client.acknowledgeNotifications();

    expect(
      core.acknowledgeNotifications.mock.calls.map(([s]: [string]) => s),
    ).toEqual(['http://a', 'http://b']);
  });

  it('logs a failing server and still resolves', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client, core } = makeClient(async (server) => {
      if (server === 'http://a') throw new Error('down');
    });

    await expect(client.acknowledgeNotifications()).resolves.toBeUndefined();

    expect(core.acknowledgeNotifications).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toBeInstanceOf(Error);
  });

  it('does nothing without servers', async () => {
    const { client, core } = makeClient(async () => {});
    client.servers = [];

    await client.acknowledgeNotifications();

    expect(core.acknowledgeNotifications).not.toHaveBeenCalled();
  });
});
