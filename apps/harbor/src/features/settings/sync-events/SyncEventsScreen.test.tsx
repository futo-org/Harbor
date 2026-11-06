jest.mock('@/src/common/theme', () => ({
  useTheme: () => ({
    theme: {
      palette: new Proxy({}, { get: () => '#000' }),
      atoms: new Proxy({}, { get: () => ({}) }),
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
    Text: ({ children, ...props }: { children?: unknown }) =>
      react.createElement(rn.Text, props, children),
    IconButton: ({
      icon,
      onPress,
    }: {
      icon?: () => unknown;
      onPress?: () => void;
    }) => react.createElement(rn.Pressable, { onPress }, icon?.()),
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

let mockIdentityKey: string | null = 'identity';
jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  useCurrentIdentity: () => ({ identityKey: mockIdentityKey }),
}));

import { useEventPushIssuesStore } from '@/src/features/core/event-push-issues/useEventPushIssuesStore';
import { useServerFailuresStore } from '@/src/features/core/server-failures/useServerFailuresStore';
import { useLastSyncStore } from '@/src/features/core/sync-status/useLastSyncStore';
import type { EventKey, ServerPushResult } from '@polycentric/react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import * as React from 'react';
import SyncEventsScreen from './SyncEventsScreen';

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
    useLastSyncStore.getState().record(full);
  });

async function renderScreen() {
  return await render(<SyncEventsScreen />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIdentityKey = 'identity';
  useEventPushIssuesStore.getState().clearAll();
  useServerFailuresStore.getState().clearAll();
  useLastSyncStore.getState().clearAll();
});

describe('page', () => {
  it('goes back, or to settings when there is no history', async () => {
    const screen = await renderScreen();
    expect(screen.getByText('Sync events')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalled();

    mockRouter.canGoBack.mockReturnValueOnce(false);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/settings');
  });

  it('shows when the identity last synced', async () => {
    const screen = await renderScreen();
    expect(screen.getByText('Not synced yet')).toBeTruthy();

    await record([{}]);
    expect(screen.getByText('Last synced just now')).toBeTruthy();
  });

  it('shows the empty state when there are no issues', async () => {
    const screen = await renderScreen();
    expect(
      screen.getByText('No servers have reported problems with your events.'),
    ).toBeTruthy();
    expect(screen.queryByText('Clear all')).toBeNull();
  });
});

describe('issue list', () => {
  it('groups issues under the server that reported them', async () => {
    await record([
      {
        eventIssues: [
          { key: key(2, 1), errors: ['too long'], warnings: [] },
          { key: key(4, 2), errors: [], warnings: ['dropped'] },
        ],
      },
    ]);
    const screen = await renderScreen();

    expect(screen.getByText(A)).toBeTruthy();
    expect(screen.queryByText(B)).toBeNull();
    expect(screen.getByText('Post not saved')).toBeTruthy();
    expect(screen.getByText('too long')).toBeTruthy();
    expect(
      screen.getByText('Reaction or repost saved without content'),
    ).toBeTruthy();
    expect(screen.getByText('dropped')).toBeTruthy();
    expect(screen.getByTestId('icon-alertCircle')).toBeTruthy();
    expect(screen.getByTestId('icon-warning')).toBeTruthy();
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

    await fireEvent.press(screen.getAllByTestId('icon-close')[0]);

    expect(screen.getAllByText('Post not saved')).toHaveLength(1);
    expect(
      Object.values(useEventPushIssuesStore.getState().issues.identity),
    ).toHaveLength(1);
  });

  it('shows a server failure above its event issues', async () => {
    await record([{ error: new Error('connection refused') }]);
    const screen = await renderScreen();

    expect(screen.getByText(A)).toBeTruthy();
    expect(screen.getByText("Couldn't reach server")).toBeTruthy();
    expect(screen.getByText('connection refused')).toBeTruthy();
  });

  it("clears one server's issues", async () => {
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

    await fireEvent.press(screen.getByLabelText(`Clear issues for ${A}`));

    expect(screen.queryByText(A)).toBeNull();
    expect(screen.getByText(B)).toBeTruthy();
    expect(
      Object.values(useEventPushIssuesStore.getState().issues.identity).map(
        (i) => i.server,
      ),
    ).toEqual([B]);
  });

  it('clears every server', async () => {
    await record([
      {
        eventIssues: [{ key: key(2, 1), errors: ['too long'], warnings: [] }],
      },
      { server: B, error: new Error('offline') },
    ]);
    const screen = await renderScreen();

    await fireEvent.press(screen.getByText('Clear all'));

    expect(screen.queryByText(A)).toBeNull();
    expect(screen.queryByText(B)).toBeNull();
    expect(useServerFailuresStore.getState().failures.identity).toEqual({});
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
    mockIdentityKey = 'someone else';
    await record([
      {
        eventIssues: [{ key: key(2, 1), errors: ['too long'], warnings: [] }],
      },
    ]);
    const screen = await renderScreen();
    expect(screen.queryByText(A)).toBeNull();
    expect(screen.getByText('Not synced yet')).toBeTruthy();
  });
});
