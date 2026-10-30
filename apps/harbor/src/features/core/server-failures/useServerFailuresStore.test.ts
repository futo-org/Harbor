import type { ServerPushResult } from '@polycentric/react-native';
import { useServerFailuresStore } from './useServerFailuresStore';

const get = () => useServerFailuresStore.getState();

const SERVER_A = 'https://a.example';
const SERVER_B = 'https://b.example';
const IDENTITY = 'identity';
const OTHER_IDENTITY = 'other identity';

const result = (
  server: string,
  error?: unknown,
  identity = IDENTITY,
): ServerPushResult =>
  error === undefined
    ? { identity, server, eventIssues: [] }
    : { identity, server, eventIssues: [], error };

beforeEach(() => {
  get().clearAll();
});

describe('useServerFailuresStore', () => {
  it('replaces a server failure each sync', () => {
    get().record([result(SERVER_A, new Error('unreachable'))], 100);
    get().record([result(SERVER_A, new Error('timed out'))], 200);

    expect(get().failures[IDENTITY]).toEqual({
      [SERVER_A]: { message: 'timed out', at: 200 },
    });
  });

  it('clears a server failure after a push without one', () => {
    get().record([
      result(SERVER_A, new Error('unreachable')),
      result(SERVER_B, 'offline'),
    ]);
    get().record([result(SERVER_A), result(SERVER_B, 'offline')]);

    expect(get().failures[IDENTITY]).toEqual({
      [SERVER_B]: { message: 'offline', at: expect.any(Number) },
    });
  });

  it('drops failures for servers a sync no longer pushes to', () => {
    get().record([result(SERVER_A, 'offline'), result(SERVER_B, 'offline')]);
    get().record([result(SERVER_B, 'offline')]);

    expect(Object.keys(get().failures[IDENTITY])).toEqual([SERVER_B]);
  });

  it("keeps each identity's failures separate", () => {
    get().record([result(SERVER_A, 'banned', IDENTITY)]);
    const before = get().failures[IDENTITY];
    get().record([result(SERVER_A, undefined, OTHER_IDENTITY)]);

    expect(get().failures[IDENTITY]).toBe(before);
    expect(get().failures[OTHER_IDENTITY]).toEqual({});
  });

  it("clears a server's failure for one identity", () => {
    get().record([result(SERVER_A, 'offline', IDENTITY)]);
    get().record([result(SERVER_A, 'offline', OTHER_IDENTITY)]);
    get().clearServer(IDENTITY, SERVER_A);

    expect(get().failures[IDENTITY]).toEqual({});
    expect(Object.keys(get().failures[OTHER_IDENTITY])).toEqual([SERVER_A]);
  });
});
