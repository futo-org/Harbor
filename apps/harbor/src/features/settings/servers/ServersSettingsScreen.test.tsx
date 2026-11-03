jest.mock('@/src/common/theme', () => ({
  useTheme: () => ({
    theme: {
      palette: new Proxy({}, { get: () => '#000' }),
      atoms: new Proxy({}, { get: () => ({}) }),
    },
  }),
  Atoms: new Proxy({}, { get: () => ({}) }),
  Spacing: new Proxy({}, { get: () => 0 }),
  withHexOpacity: (color: string) => color,
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
    Text: ({ children, ...props }: { children?: unknown }) =>
      react.createElement(rn.Text, props, children),
    IconButton: ({
      icon,
      onPress,
    }: {
      icon?: () => unknown;
      onPress?: () => void;
    }) => react.createElement(rn.Pressable, { onPress }, icon?.()),
    TextInput: (props: object) => react.createElement(rn.TextInput, props),
    Screen,
    ScreenHeader: ({ title, onBack }: { title: string; onBack: () => void }) =>
      react.createElement(
        rn.Pressable,
        { onPress: onBack, accessibilityLabel: 'Back' },
        react.createElement(rn.Text, null, title),
      ),
  };
});

jest.mock('@/src/common/components/Icon', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) =>
      react.createElement(Text, { testID: `icon-${name}` }, name),
  };
});

jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
  COLLECTION: jest.requireActual(
    '../../../../../../packages/js-core/src/constants',
  ).COLLECTION,
}));

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

// The real hook reaches the polycentric client (native modules) through
// useQuery; none of these tests exercise the moderation affordances.
jest.mock('@/src/features/moderation/hooks/useModerationStatus', () => ({
  __esModule: true,
  default: () => ({
    isLoading: false,
    moderatedServers: [] as string[],
    isModerator: false,
  }),
}));

// The only authorization check in the servers settings screen is used to
// gate the editing actions.
// We will mock it to always be authorized unless changed.
let mockCanRotate = true;
jest.mock('@/src/common/lib/polycentric-hooks/useCurrentAuthorization', () => ({
  useCurrentAuthorization: () => ({
    canRotate: mockCanRotate,
    canSign: mockCanRotate,
    refresh: () => {},
  }),
}));

const mockHook = {
  identityKey: 'identity' as string | null,
  servers: [] as string[],
  suggestedServers: [] as string[],
  isBusy: false,
  addError: null as Error | null,
  addServer: jest.fn(async (_url: string) => true),
  removeServer: jest.fn(async (_server: string) => undefined),
};
jest.mock('./useServerSettings', () => ({
  useServerSettings: () => mockHook,
}));

import { useEventPushIssuesStore } from '@/src/features/core/event-push-issues/useEventPushIssuesStore';
import { useServerFailuresStore } from '@/src/features/core/server-failures/useServerFailuresStore';
import type { EventKey, ServerPushResult } from '@polycentric/react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import * as React from 'react';
import ServersSettingsScreen from './ServersSettingsScreen';

async function renderScreen() {
  return await render(<ServersSettingsScreen />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCanRotate = true;
  mockHook.identityKey = 'identity';
  mockHook.servers = [];
  mockHook.suggestedServers = [];
  mockHook.isBusy = false;
  mockHook.addError = null;
  mockHook.addServer.mockResolvedValue(true);
  useEventPushIssuesStore.getState().clearAll();
  useServerFailuresStore.getState().clearAll();
});

describe('server list', () => {
  it('shows the empty state when no servers are configured', async () => {
    const screen = await renderScreen();
    expect(screen.getByText('No servers configured')).toBeTruthy();
  });

  it('renders a row per server and removes the pressed one', async () => {
    mockHook.servers = ['https://one.example', 'https://two.example'];
    const screen = await renderScreen();

    expect(screen.queryByText('No servers configured')).toBeNull();
    expect(screen.getByText('https://one.example')).toBeTruthy();

    await fireEvent.press(screen.getAllByTestId('icon-remove')[1]);
    expect(mockHook.removeServer).toHaveBeenCalledWith('https://two.example');
  });
});

describe('page', () => {
  it('goes back, or to settings when there is no history', async () => {
    const screen = await renderScreen();
    expect(screen.getByText('Servers')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalled();

    mockRouter.canGoBack.mockReturnValueOnce(false);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/settings');
  });
});

describe('rotation gate', () => {
  it('hides every editing affordance for a non-rotation key', async () => {
    mockCanRotate = false;
    mockHook.servers = ['https://one.example'];
    mockHook.suggestedServers = ['https://seed.example'];
    const screen = await renderScreen();

    expect(screen.getByText('https://one.example')).toBeTruthy();
    expect(screen.queryByTestId('icon-remove')).toBeNull();
    expect(screen.queryByTestId('icon-addOutline')).toBeNull();
    expect(
      screen.queryByPlaceholderText('https://server.example.com'),
    ).toBeNull();

    await fireEvent.press(screen.getByText('https://seed.example'));
    expect(mockHook.addServer).not.toHaveBeenCalled();
  });
});

describe('suggested servers', () => {
  it('is hidden when there are no suggestions', async () => {
    const screen = await renderScreen();
    expect(screen.queryByText('Suggested servers')).toBeNull();
  });

  it('adds a suggestion when its row is pressed', async () => {
    mockHook.suggestedServers = ['https://seed.example'];
    const screen = await renderScreen();

    expect(screen.getByText('Suggested servers')).toBeTruthy();
    await fireEvent.press(screen.getByText('https://seed.example'));
    expect(mockHook.addServer).toHaveBeenCalledWith('https://seed.example');
  });
});

describe('add server form', () => {
  const input = (screen: Awaited<ReturnType<typeof renderScreen>>) =>
    screen.getByPlaceholderText('https://server.example.com');

  it('submits the trimmed url and clears the input on success', async () => {
    const screen = await renderScreen();

    await fireEvent.changeText(input(screen), '  https://new.example  ');
    await fireEvent.press(screen.getByTestId('icon-addOutline'));

    expect(mockHook.addServer).toHaveBeenCalledWith('https://new.example');
    expect(input(screen).props.value).toBe('');
  });

  it('keeps the input when the add fails', async () => {
    mockHook.addServer.mockResolvedValueOnce(false);
    const screen = await renderScreen();

    await fireEvent.changeText(input(screen), 'https://new.example');
    await fireEvent.press(screen.getByTestId('icon-addOutline'));

    expect(input(screen).props.value).toBe('https://new.example');
  });

  it('shows a spinner instead of the add button while busy', async () => {
    mockHook.isBusy = true;
    const screen = await renderScreen();

    expect(screen.getByLabelText('Adding server')).toBeTruthy();
    expect(screen.queryByTestId('icon-addOutline')).toBeNull();
  });

  it('shows the add error and toggles its logs', async () => {
    mockHook.addError = new Error('offline');
    mockHook.addError.stack = 'stack-trace';
    const screen = await renderScreen();

    expect(screen.queryByText('stack-trace')).toBeNull();
    await fireEvent.press(screen.getByText(/Could not add server\./));
    expect(screen.getByText('stack-trace')).toBeTruthy();

    await fireEvent.press(screen.getByText(/Could not add server\./));
    expect(screen.queryByText('stack-trace')).toBeNull();
  });
});

describe('sync issues', () => {
  const A = 'https://one.example';
  const B = 'https://two.example';

  const key = (collection: number, sequence: number): EventKey => ({
    collection,
    identity: 'identity',
    signedBy: { keyType: 1, key: new Uint8Array([1, 2, 3]).buffer },
    sequence: BigInt(sequence),
  });

  const record = (results: Partial<ServerPushResult>[]) =>
    act(() => {
      const full = results.map((r) => ({
        identity: 'identity',
        server: A,
        eventIssues: [],
        ...r,
      })) as ServerPushResult[];
      useEventPushIssuesStore.getState().record(full);
      useServerFailuresStore.getState().record(full);
    });

  beforeEach(() => {
    mockHook.servers = [A, B];
  });

  it('shows no badge for a server without issues', async () => {
    const screen = await renderScreen();
    expect(screen.queryByTestId('icon-ban')).toBeNull();
    expect(screen.queryByTestId('icon-flag')).toBeNull();
  });

  it('badges only the affected server with its issue count', async () => {
    await record([
      {
        eventIssues: [
          { key: key(2, 1), errors: ['too long'], warnings: [] },
          { key: key(4, 2), errors: [], warnings: ['dropped'] },
        ],
      },
    ]);
    const screen = await renderScreen();

    expect(screen.getByLabelText('2 sync issues')).toBeTruthy();
    expect(screen.getAllByTestId('icon-ban')).toHaveLength(1);
    // Collapsed until pressed
    expect(screen.queryByText('too long')).toBeNull();
  });

  it('uses the warning colour when there are only warnings', async () => {
    await record([
      { eventIssues: [{ key: key(2, 1), errors: [], warnings: ['dropped'] }] },
    ]);
    const screen = await renderScreen();

    expect(screen.getByLabelText('1 sync issue')).toBeTruthy();
    expect(screen.getByTestId('icon-flag')).toBeTruthy();
    expect(screen.queryByTestId('icon-ban')).toBeNull();
  });

  it('expands to list the issues, then collapses', async () => {
    await record([
      {
        eventIssues: [
          { key: key(2, 1), errors: ['too long'], warnings: [] },
          { key: key(4, 2), errors: [], warnings: ['dropped'] },
        ],
      },
    ]);
    const screen = await renderScreen();

    await fireEvent.press(screen.getByLabelText('2 sync issues'));
    expect(screen.getByText('Post not saved')).toBeTruthy();
    expect(screen.getByText('too long')).toBeTruthy();
    expect(
      screen.getByText('Reaction or repost saved without content'),
    ).toBeTruthy();
    expect(screen.getByText('dropped')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('2 sync issues'));
    expect(screen.queryByText('too long')).toBeNull();
  });

  it('dismisses a single issue', async () => {
    await record([
      {
        eventIssues: [
          { key: key(2, 1), errors: ['too long'], warnings: [] },
          { key: key(2, 2), errors: ['bad sig'], warnings: [] },
        ],
      },
    ]);
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText('2 sync issues'));

    // Newest first, both seen at the same time; dismiss whichever is first.
    await fireEvent.press(screen.getAllByTestId('icon-close')[0]);

    expect(screen.getByLabelText('1 sync issue')).toBeTruthy();
    expect(
      Object.values(useEventPushIssuesStore.getState().issues.identity),
    ).toHaveLength(1);
  });

  it('shows a server failure above the event issues', async () => {
    await record([{ error: new Error('connection refused') }]);
    const screen = await renderScreen();

    await fireEvent.press(screen.getByLabelText('1 sync issue'));
    expect(screen.getByText("Couldn't reach server")).toBeTruthy();
    expect(screen.getByText('connection refused')).toBeTruthy();
  });

  it("clears all of a server's issues", async () => {
    await record([
      {
        eventIssues: [{ key: key(2, 1), errors: ['too long'], warnings: [] }],
      },
      {
        server: B,
        eventIssues: [{ key: key(2, 1), errors: ['too long'], warnings: [] }],
      },
    ]);
    const screen = await renderScreen();
    await fireEvent.press(screen.getAllByLabelText('1 sync issue')[0]);

    await fireEvent.press(screen.getByText('Clear all'));

    expect(screen.getAllByLabelText('1 sync issue')).toHaveLength(1);
    expect(
      Object.values(useEventPushIssuesStore.getState().issues.identity).map(
        (i) => i.server,
      ),
    ).toEqual([B]);
  });

  it("opens a post's page, or the profile for a profile update", async () => {
    await record([
      {
        eventIssues: [
          { key: key(2, 7), errors: ['banned'], warnings: [] },
          { key: key(3, 8), errors: ['banned'], warnings: [] },
          { key: key(4, 9), errors: ['banned'], warnings: [] },
        ],
      },
    ]);
    const screen = await renderScreen();
    await fireEvent.press(screen.getByLabelText('3 sync issues'));

    await fireEvent.press(screen.getByText('Post not saved'));
    // Signer key [1, 2, 3] has fingerprint 010203.
    expect(mockRouter.navigate).toHaveBeenLastCalledWith(
      '/identity/post/010203/7',
    );

    await fireEvent.press(screen.getByText('Profile update not saved'));
    expect(mockRouter.navigate).toHaveBeenLastCalledWith('/identity');

    // A reaction has no page of its own.
    mockRouter.navigate.mockClear();
    await fireEvent.press(screen.getByText('Reaction or repost not saved'));
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('ignores issues recorded for another identity', async () => {
    mockHook.identityKey = 'someone else';
    await record([
      {
        eventIssues: [{ key: key(2, 1), errors: ['too long'], warnings: [] }],
      },
    ]);
    const screen = await renderScreen();
    expect(screen.queryByTestId('icon-ban')).toBeNull();
  });
});
