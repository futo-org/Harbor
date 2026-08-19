jest.mock('@/src/common/theme', () => ({
  useTheme: () => ({
    theme: {
      palette: new Proxy({}, { get: () => '#000' }),
      atoms: new Proxy({}, { get: () => ({}) }),
    },
  }),
  Atoms: new Proxy({}, { get: () => ({}) }),
  Spacing: new Proxy({}, { get: () => 8 }),
  typography: { lineHeight: new Proxy({}, { get: () => 20 }) },
  ZIndex: { raised: 10 },
}));

jest.mock('@/src/common/components', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    Text: ({ children }: { children?: unknown }) =>
      react.createElement(Text, null, children),
  };
});

jest.mock('@/src/common/components/primitives/Text', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    Text: ({ children }: { children?: unknown }) =>
      react.createElement(Text, null, children),
  };
});

jest.mock('@/src/common/components/layout', () => {
  const react = require('react');
  const Screen = ({ children }: { children?: unknown }) =>
    react.createElement(react.Fragment, null, children);
  Screen.PrimaryColumn = ({ children }: { children?: unknown }) =>
    react.createElement(react.Fragment, null, children);
  return { Screen };
});

jest.mock('@/src/common/components/layout/Topbar', () => {
  const react = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ center }: { center?: unknown }) =>
      react.createElement(View, { testID: 'topbar' }, center),
  };
});

// Renders rows, headers, and footers so list composition is observable.
type ListProps = {
  HeaderComponent?: (() => unknown) | unknown;
  ListHeaderComponent?: unknown;
  ListEmptyComponent?: unknown;
  ListFooterComponent?: unknown;
  data: { identity: string }[];
  renderItem: (info: { item: unknown; index: number }) => unknown;
  onEndReached?: () => void;
};
let mockListProps: ListProps | null = null;
jest.mock('@/src/common/components/List', () => {
  const react = require('react');
  const { View } = require('react-native');
  return {
    List: (props: ListProps) => {
      mockListProps = props;
      return react.createElement(
        View,
        null,
        // Mirrors the real `List`, which takes an element or a component.
        typeof props.HeaderComponent === 'function'
          ? props.HeaderComponent()
          : (props.HeaderComponent ?? null),
        props.ListHeaderComponent,
        props.data.length === 0
          ? props.ListEmptyComponent
          : props.data.map((item, index) =>
              react.createElement(
                View,
                { key: item.identity },
                props.renderItem({ item, index }),
              ),
            ),
        props.ListFooterComponent,
      );
    },
  };
});

jest.mock('@/src/common/components/ListEmpty', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    ListEmpty: ({ children }: { children?: unknown }) =>
      react.createElement(Text, null, children),
  };
});

jest.mock('@/src/common/components/Tabs', () => {
  const react = require('react');
  const { Text, View } = require('react-native');
  const Tabs = ({ children }: { children?: unknown }) =>
    react.createElement(View, null, children);
  Tabs.Tab = ({
    children,
    active,
    onPress,
  }: {
    children: string;
    active?: boolean;
    onPress: () => void;
  }) =>
    react.createElement(
      Text,
      { onPress, accessibilityState: { selected: active } },
      children,
    );
  return { Tabs };
});

jest.mock('@/src/common/components/Avatar/ProfileAvatar', () => ({
  ProfileAvatar: () => null,
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
  useLocalSearchParams: () => ({ identityId: 'profile-id' }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  shortenIdentityId: (id: string) => `short-${id}`,
  truncateName: (name: string) => name,
  useCurrentIdentity: () => ({ identityKey: 'me' }),
  useUsername: () => 'fallback',
}));

let mockProfileAlias: string | null = null;
jest.mock('@/src/features/profile/hooks/useProfile', () => ({
  useProfile: () => ({ name: 'Alice', alias: mockProfileAlias }),
}));

jest.mock('./FollowButton', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ identity }: { identity: string }) =>
      react.createElement(Text, { testID: `follow-${identity}` }, 'Follow'),
  };
});

const mockLoadMore = jest.fn();
let mockEntries: { identity: string; createdAt: bigint }[] = [];
let mockHasMore = false;
// Both pages are mounted, so only the active one reports entries.
jest.mock('./hooks/useFollowList', () => ({
  useFollowList: (_mode: string, _identityId: unknown, active = true) => ({
    entries: active ? mockEntries : [],
    isLoading: false,
    isRefreshing: false,
    error: null,
    hasMore: active && mockHasMore,
    loadMore: mockLoadMore,
    refresh: jest.fn(),
  }),
}));

import { fireEvent, render } from '@testing-library/react-native';
import * as React from 'react';
import FollowListScreen from './FollowListScreen';

function entry(identity: string) {
  return { identity, createdAt: 0n };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListProps = null;
  mockEntries = [];
  mockHasMore = false;
  mockProfileAlias = null;
});

describe('FollowListScreen header', () => {
  it('shows the display name and identity prefix', async () => {
    const screen = await render(<FollowListScreen mode="following" />);

    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText(/short-profile-id/)).toBeTruthy();
  });

  it('appends the alias when available', async () => {
    mockProfileAlias = 'alice@domain.com';
    const screen = await render(<FollowListScreen mode="following" />);

    expect(screen.getByText(/alice@domain.com/)).toBeTruthy();
  });
});

describe('FollowListScreen tabs', () => {
  it('switches pages in place instead of navigating', async () => {
    const screen = await render(<FollowListScreen mode="following" />);

    await fireEvent.press(screen.getByText('Followers'));

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText('No followers yet.')).toBeTruthy();
  });

  it('opens on the page the route asked for', async () => {
    const screen = await render(<FollowListScreen mode="followers" />);

    expect(screen.getByText('No followers yet.')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('FollowListScreen rows', () => {
  it('renders a row per identity linking to their profile', async () => {
    mockEntries = [entry('alice-id'), entry('bob-id')];
    const screen = await render(<FollowListScreen mode="followers" />);

    await fireEvent.press(screen.getByText('short-alice-id'));
    expect(mockPush).toHaveBeenCalledWith('/alice-id');
    expect(screen.getByTestId('follow-bob-id')).toBeTruthy();
  });

  it('hides the follow button on your own row', async () => {
    mockEntries = [entry('me')];
    const screen = await render(<FollowListScreen mode="followers" />);

    expect(screen.queryByTestId('follow-me')).toBeNull();
  });

  it('shows an empty state per mode', async () => {
    const following = await render(<FollowListScreen mode="following" />);
    expect(following.getByText('Not following anyone yet.')).toBeTruthy();

    const followers = await render(<FollowListScreen mode="followers" />);
    expect(followers.getByText('No followers yet.')).toBeTruthy();
  });
});

describe('FollowListScreen paging', () => {
  it('wires end-reached to loadMore and shows the footer spinner', async () => {
    mockEntries = [entry('alice-id')];
    mockHasMore = true;
    const screen = await render(<FollowListScreen mode="followers" />);

    expect(screen.getByLabelText('Loading more')).toBeTruthy();
    mockListProps!.onEndReached!();
    expect(mockLoadMore).toHaveBeenCalled();
  });

  it('does not page when there is no more data', async () => {
    mockEntries = [entry('alice-id')];
    const screen = await render(<FollowListScreen mode="followers" />);

    expect(screen.queryByLabelText('Loading more')).toBeNull();
    expect(mockListProps!.onEndReached).toBeUndefined();
  });
});
