// The barrel pulls in native uniffi init at import time — expose just what
// the hook needs.
jest.mock('@polycentric/react-native', () => ({
  ServerAlreadyAddedError: class ServerAlreadyAddedError extends Error {},
}));

const mockClient = {
  servers: ['https://default.example'],
  identityManager: {
    addServer: jest.fn(async () => undefined),
    removeServer: jest.fn(async () => undefined),
  },
};
let mockIdentity: { servers?: string[] } | null = null;

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  DEFAULT_SEED_SERVERS: ['https://seed-a.example', 'https://seed-b.example'],
  usePolycentric: () => mockClient,
  useCurrentIdentity: () => ({ identity: mockIdentity }),
}));

jest.mock('@/src/common/query/hooks/useQuery', () => ({
  invalidateAllQueries: jest.fn(),
}));

const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('@/src/common/components/toast', () => ({
  useToast: () => mockToast,
}));

const mockConfirm = jest.fn(async () => true);
jest.mock('@/src/common/lib/dialogs/alert', () => ({
  confirm: (...args: unknown[]) => mockConfirm(...(args as [])),
}));

import { invalidateAllQueries } from '@/src/common/query/hooks/useQuery';
import { ServerAlreadyAddedError } from '@polycentric/react-native';
import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { useServerSettings } from './useServerSettings';

function renderHook(): { current: ReturnType<typeof useServerSettings> } {
  const result = { current: null as never };
  function Probe() {
    result.current = useServerSettings() as never;
    return null;
  }
  act(() => {
    TestRenderer.create(React.createElement(Probe));
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIdentity = null;
  mockConfirm.mockResolvedValue(true);
});

describe('server list', () => {
  it('falls back to the client servers when the identity has none', () => {
    const hook = renderHook();
    expect(hook.current.servers).toEqual(['https://default.example']);
  });

  it('uses the identity servers, even when explicitly empty', () => {
    mockIdentity = { servers: [] };
    const hook = renderHook();
    expect(hook.current.servers).toEqual([]);
    expect(hook.current.suggestedServers).toEqual([
      'https://seed-a.example',
      'https://seed-b.example',
    ]);
  });

  it('filters already-added servers out of the suggestions', () => {
    mockIdentity = { servers: ['https://seed-a.example'] };
    const hook = renderHook();
    expect(hook.current.suggestedServers).toEqual(['https://seed-b.example']);
  });
});

describe('addServer', () => {
  it('adds the server, refreshes queries, and reports success', async () => {
    const hook = renderHook();

    let added = false;
    await act(async () => {
      added = await hook.current.addServer('https://new.example');
    });

    expect(added).toBe(true);
    expect(mockClient.identityManager.addServer).toHaveBeenCalledWith(
      'https://new.example',
    );
    expect(invalidateAllQueries).toHaveBeenCalledWith(mockClient);
    expect(mockToast.success).toHaveBeenCalledWith('Server added');
    expect(hook.current.addError).toBeNull();
  });

  it('does nothing for an empty url', async () => {
    const hook = renderHook();

    let added = true;
    await act(async () => {
      added = await hook.current.addServer('');
    });

    expect(added).toBe(false);
    expect(mockClient.identityManager.addServer).not.toHaveBeenCalled();
  });

  it('ignores a second add while one is in flight', async () => {
    let finishFirst: () => void = () => {};
    mockClient.identityManager.addServer.mockReturnValueOnce(
      new Promise<undefined>((resolve) => {
        finishFirst = () => resolve(undefined);
      }),
    );
    const hook = renderHook();

    let first: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      first = hook.current.addServer('https://slow.example');
    });
    expect(hook.current.isBusy).toBe(true);

    let second = true;
    await act(async () => {
      second = await hook.current.addServer('https://other.example');
    });
    expect(second).toBe(false);
    expect(mockClient.identityManager.addServer).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishFirst();
      await first;
    });
    expect(hook.current.isBusy).toBe(false);
  });

  it('reports an already-added server without treating it as an error', async () => {
    mockClient.identityManager.addServer.mockRejectedValueOnce(
      new ServerAlreadyAddedError('dup'),
    );
    const hook = renderHook();

    let added = true;
    await act(async () => {
      added = await hook.current.addServer('https://default.example');
    });

    expect(added).toBe(false);
    expect(mockToast.info).toHaveBeenCalledWith('Server already added');
    expect(hook.current.addError).toBeNull();
  });

  it('surfaces other failures via toast and addError', async () => {
    mockClient.identityManager.addServer.mockRejectedValueOnce(
      new Error('offline'),
    );
    const hook = renderHook();

    let added = true;
    await act(async () => {
      added = await hook.current.addServer('https://new.example');
    });

    expect(added).toBe(false);
    expect(mockToast.error).toHaveBeenCalledWith('Could not add server');
    expect(hook.current.addError?.message).toBe('offline');
  });

  it('clears a previous error on the next attempt', async () => {
    mockClient.identityManager.addServer.mockRejectedValueOnce(
      new Error('offline'),
    );
    const hook = renderHook();

    await act(async () => {
      await hook.current.addServer('https://new.example');
    });
    expect(hook.current.addError).not.toBeNull();

    await act(async () => {
      await hook.current.addServer('https://new.example');
    });
    expect(hook.current.addError).toBeNull();
  });
});

describe('removeServer', () => {
  it('asks for confirmation before removing', async () => {
    const hook = renderHook();

    await act(async () => {
      await hook.current.removeServer('https://default.example');
    });

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Remove https://default.example?',
      }),
    );
    expect(mockClient.identityManager.removeServer).toHaveBeenCalledWith(
      'https://default.example',
    );
    expect(invalidateAllQueries).toHaveBeenCalledWith(mockClient);
    expect(mockToast.success).toHaveBeenCalledWith('Server removed');
  });

  it('does nothing when the confirmation is declined', async () => {
    mockConfirm.mockResolvedValueOnce(false);
    const hook = renderHook();

    await act(async () => {
      await hook.current.removeServer('https://default.example');
    });

    expect(mockClient.identityManager.removeServer).not.toHaveBeenCalled();
  });

  it('surfaces failures via toast', async () => {
    mockClient.identityManager.removeServer.mockRejectedValueOnce(
      new Error('offline'),
    );
    const hook = renderHook();

    await act(async () => {
      await hook.current.removeServer('https://default.example');
    });

    expect(mockToast.error).toHaveBeenCalledWith('offline');
    expect(hook.current.isBusy).toBe(false);
  });
});
