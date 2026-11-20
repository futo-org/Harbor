jest.mock('@/src/common/theme', () => ({
  useTheme: () => ({
    theme: {
      atoms: new Proxy(
        {},
        {
          get: () =>
            new Proxy({}, { get: () => new Proxy({}, { get: () => ({}) }) }),
        },
      ),
    },
  }),
  Atoms: new Proxy({}, { get: () => ({}) }),
  Spacing: new Proxy({}, { get: () => 0 }),
}));

jest.mock('@/src/common/lib/navigation/usePageTitle', () => ({
  usePageTitle: () => {},
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/src/common/components', () => {
  const react = require('react');
  const rn = require('react-native');
  const Screen = ({ children }: { children?: unknown }) =>
    react.createElement(rn.View, null, children);
  Screen.PrimaryColumn = Screen;
  return {
    Text: ({ children }: { children?: unknown }) =>
      react.createElement(rn.Text, null, children),
    Button: ({
      title,
      onPress,
      disabled,
    }: {
      title: string;
      onPress?: () => void;
      disabled?: boolean;
    }) =>
      react.createElement(
        rn.Pressable,
        { onPress, disabled },
        react.createElement(rn.Text, null, title),
      ),
    Screen,
    ScreenHeader: ({ title }: { title: string; message?: string }) =>
      react.createElement(rn.Text, null, title),
  };
});

jest.mock('../servers/ServerRow', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    ServerRow: ({ server }: { server: string }) =>
      react.createElement(Text, null, server),
  };
});

const mockRouter = {
  canGoBack: jest.fn(() => true),
  back: jest.fn(),
  navigate: jest.fn(),
};
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
}));

const mockReloadAppAsync = jest.fn(async () => undefined);
jest.mock('expo', () => ({
  reloadAppAsync: () => mockReloadAppAsync(),
}));

const mockConfirm = jest.fn(
  async (_options: { title: string; message?: string }) => true,
);
const mockShowAlert = jest.fn(
  async (_options: { title: string; message?: string }) => 0,
);
jest.mock('@/src/common/lib/dialogs', () => ({
  confirm: (options: { title: string; message?: string }) =>
    mockConfirm(options),
  showAlert: (options: { title: string; message?: string }) =>
    mockShowAlert(options),
}));

const mockGetPushToken = jest.fn(async (): Promise<string | null> => 'token');
jest.mock('@/src/common/lib/notifications/registerPushToken', () => ({
  getPushToken: () => mockGetPushToken(),
}));

const IDENTITY = 'ab'.repeat(32);
const SERVERS = ['https://a.example', 'https://old.example'];
const PUSH_SERVERS = ['https://push.example'];

const calls: string[] = [];
const mockClient = {
  identityServerHistory: jest.fn(() => SERVERS),
  deleteRemoteIdentity: jest.fn(
    async (): Promise<{ server: string; deleted: boolean }[]> => [],
  ),
  clearDevicePushSubscriptions: jest.fn(
    async (_servers: string[], _target: object) => undefined,
  ),
  deleteLocalIdentity: jest.fn(async (_identity: string) => undefined),
};
let mockIdentityKey: string | null = IDENTITY;
jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  usePolycentric: () => mockClient,
  useCurrentIdentity: () => ({ identityKey: mockIdentityKey }),
}));
jest.mock('@/src/common/lib/polycentric-hooks/PolycentricProvider', () => ({
  DEFAULT_NOTIFICATION_SERVERS: ['https://push.example'],
}));

import { act, fireEvent, render } from '@testing-library/react-native';
import * as React from 'react';
import DeleteIdentityScreen from './DeleteIdentityScreen';

const allDeleted = () => SERVERS.map((server) => ({ server, deleted: true }));

type Rendered = Awaited<ReturnType<typeof render>>;

// The header carries the same text; the button comes last.
async function pressDeleteButton(screen: Rendered) {
  await act(async () => {
    fireEvent.press(screen.getAllByText('Delete Identity').at(-1)!);
  });
}

async function pressDelete() {
  const screen = await render(<DeleteIdentityScreen />);
  await pressDeleteButton(screen);
  return screen;
}

beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;
  mockIdentityKey = IDENTITY;
  mockConfirm.mockResolvedValue(true);
  mockGetPushToken.mockResolvedValue('token');
  mockClient.deleteRemoteIdentity.mockImplementation(async () => {
    calls.push('remote');
    return allDeleted();
  });
  mockClient.clearDevicePushSubscriptions.mockImplementation(async () => {
    calls.push('push');
  });
  mockClient.deleteLocalIdentity.mockImplementation(async () => {
    calls.push('local');
  });
  mockReloadAppAsync.mockImplementation(async () => {
    calls.push('restart');
  });
});

describe('DeleteIdentityScreen', () => {
  it('shows the warning, every server and the other devices caveat', async () => {
    const screen = await render(<DeleteIdentityScreen />);

    for (const server of SERVERS) expect(screen.getByText(server)).toBeTruthy();
    expect(
      screen.getByText(/those\s+devices keep their own copy/),
    ).toBeTruthy();
    expect(screen.getByText('This cannot be undone.')).toBeTruthy();
  });

  it('renders nothing without an identity', async () => {
    mockIdentityKey = null;
    const screen = await render(<DeleteIdentityScreen />);

    expect(screen.queryByText('This cannot be undone.')).toBeNull();
  });

  it('does nothing when the confirmation is declined', async () => {
    mockConfirm.mockResolvedValue(false);

    await pressDelete();

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm.mock.calls[0]![0]).toMatchObject({ destructive: true });
    expect(calls).toEqual([]);
  });

  it('deletes remotely, removes push, wipes the device, then restarts', async () => {
    await pressDelete();

    expect(calls).toEqual(['remote', 'push', 'local', 'restart']);
    expect(mockClient.clearDevicePushSubscriptions).toHaveBeenCalledWith(
      PUSH_SERVERS,
      { service: 'expo', token: 'token' },
    );
    expect(mockClient.deleteLocalIdentity).toHaveBeenCalledWith(IDENTITY);
  });

  it('skips push removal without a push token', async () => {
    mockGetPushToken.mockResolvedValue(null);

    await pressDelete();

    expect(calls).toEqual(['remote', 'local', 'restart']);
  });

  it('still wipes the device when push removal fails', async () => {
    mockClient.clearDevicePushSubscriptions.mockRejectedValue(new Error('x'));

    await pressDelete();

    expect(calls).toEqual(['remote', 'local', 'restart']);
  });

  it('keeps everything when a server fails and the user cancels', async () => {
    mockClient.deleteRemoteIdentity.mockResolvedValue([
      { server: SERVERS[0]!, deleted: true },
      { server: SERVERS[1]!, deleted: false },
    ]);
    mockConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await pressDelete();

    expect(mockConfirm).toHaveBeenCalledTimes(2);
    expect(String(mockConfirm.mock.calls[1]![0].message)).toContain(
      'old.example',
    );
    expect(calls).toEqual([]);
  });

  it('wipes the device when a server fails and the user continues', async () => {
    mockClient.deleteRemoteIdentity.mockResolvedValue([
      { server: SERVERS[1]!, deleted: false },
    ]);

    await pressDelete();

    expect(calls).toEqual(['push', 'local', 'restart']);
  });

  it('reports a failed wipe and retries without asking the servers again', async () => {
    mockClient.deleteLocalIdentity.mockRejectedValueOnce(new Error('disk'));

    const screen = await pressDelete();

    expect(mockShowAlert).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['remote', 'push']);

    await pressDeleteButton(screen);

    expect(mockClient.deleteRemoteIdentity).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['remote', 'push', 'push', 'local', 'restart']);
  });
});
