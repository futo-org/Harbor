jest.mock('@/src/common/theme', () => ({
  useTheme: () => ({
    theme: {
      palette: new Proxy({}, { get: () => '#000' }),
      atoms: new Proxy({}, { get: () => ({}) }),
    },
  }),
  Atoms: new Proxy({}, { get: () => ({}) }),
  Spacing: new Proxy({}, { get: () => 8 }),
  // The pager renders a post skeleton for pages it has not shown yet.
  withHexOpacity: (color: string) => color,
  typography: { lineHeight: new Proxy({}, { get: () => 20 }) },
  ZIndex: { raised: 10 },
}));

jest.mock('@/src/common/components/Icon', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/src/common/components/primitives', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    Text: ({ children }: { children?: unknown }) =>
      react.createElement(Text, null, children),
  };
});

jest.mock('@/src/common/components/layout/Topbar', () => ({
  TOPBAR_HEIGHT: 60,
}));

// Renders rows, headers, and footers so list composition is observable.
type ListProps = {
  HeaderComponent?: unknown;
  ListHeaderComponent?: unknown;
  ListEmptyComponent?: unknown;
  ListFooterComponent?: unknown;
  data: { identity: string }[];
  renderItem: (info: { item: unknown; index: number }) => unknown;
};
jest.mock('@/src/common/components/List', () => {
  const react = require('react');
  const { View } = require('react-native');
  return {
    List: (props: ListProps) =>
      react.createElement(
        View,
        null,
        props.HeaderComponent,
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
      ),
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

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  useCurrentIdentity: () => ({ identityKey: 'me' }),
}));

jest.mock('@/src/features/profile/ProfileRow', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    ProfileRow: ({
      identity,
      trailing,
    }: {
      identity: string;
      trailing?: unknown;
    }) =>
      react.createElement(
        react.Fragment,
        null,
        react.createElement(Text, null, `profile-${identity}`),
        trailing,
      ),
  };
});

jest.mock('@/src/features/follow/FollowButton', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ identity }: { identity: string }) =>
      react.createElement(Text, null, `follow-${identity}`),
  };
});

type FeedStub = {
  __sort?: string;
  items: unknown[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: null;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  refresh: () => void;
};
// Every page of the pager is mounted, so each feed it renders is collected.
let mockCapturedFeeds: FeedStub[] = [];
jest.mock('../feed/FeedList', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({
      feed,
      HeaderComponent,
    }: {
      feed: FeedStub;
      HeaderComponent?: unknown;
    }) => {
      mockCapturedFeeds.push(feed);
      return react.createElement(
        react.Fragment,
        null,
        HeaderComponent,
        react.createElement(Text, null, 'feed-list'),
      );
    },
  };
});

jest.mock('./hooks/useSearchPosts', () => ({
  useSearchPosts: (_query: string, options?: { sort?: string }) => ({
    __sort: options?.sort,
    items: [],
    isLoading: false,
    isRefreshing: false,
    error: null,
    loadMore: async () => {},
    hasMore: false,
    refresh: () => {},
  }),
}));

let mockUserEntries: { identity: string }[] = [];
jest.mock('./hooks/useSearchUsers', () => ({
  useSearchUsers: () => ({
    entries: mockUserEntries,
    isLoading: false,
    isRefreshing: false,
    error: null,
    hasMore: false,
    loadMore: () => {},
    refresh: () => {},
  }),
}));

import { fireEvent, render } from '@testing-library/react-native';
import type * as React from 'react';
import { SearchResults } from './SearchResults';

async function renderResults(
  overrides: Partial<React.ComponentProps<typeof SearchResults>> = {},
) {
  const onTabChange = jest.fn();
  const onSubmitQuery = jest.fn();
  const screen = await render(
    <SearchResults
      phrase="hello"
      query="hello"
      submitted={false}
      tab="top"
      onTabChange={onTabChange}
      onSubmitQuery={onSubmitQuery}
      {...overrides}
    />,
  );
  return { screen, onTabChange, onSubmitQuery };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCapturedFeeds = [];
  mockUserEntries = [];
});

describe('SearchResults empty state', () => {
  it('shows the hint without a phrase', async () => {
    const { screen } = await renderResults({ phrase: '', query: '' });
    expect(screen.getByText('Search for posts and people.')).toBeTruthy();
  });
});

describe('SearchResults typeahead', () => {
  it('leads with the typed phrase and lists people', async () => {
    mockUserEntries = [{ identity: 'alice' }];

    const { screen } = await renderResults();
    expect(screen.getByText('hello')).toBeTruthy();
    expect(screen.getByText('profile-alice')).toBeTruthy();
    expect(screen.queryByText('Top')).toBeNull();
  });

  it('submits when the phrase row is pressed', async () => {
    const { screen, onSubmitQuery } = await renderResults();
    fireEvent.press(screen.getByText('hello'));
    expect(onSubmitQuery).toHaveBeenCalled();
  });

  it('suppresses the empty message while the query is settling', async () => {
    const { screen } = await renderResults({ query: 'hel' });
    expect(screen.queryByText('No people found.')).toBeNull();
  });

  it('shows the empty message once the query settles', async () => {
    const { screen } = await renderResults();
    expect(screen.getByText('No people found.')).toBeTruthy();
  });
});

describe('SearchResults full search', () => {
  it('shows the tabs', async () => {
    const { screen } = await renderResults({ submitted: true });
    expect(screen.getByText('Top')).toBeTruthy();
    expect(screen.getByText('Latest')).toBeTruthy();
    expect(screen.getByText('People')).toBeTruthy();
  });

  it('orders the pages to match the tabs', async () => {
    // The pager pairs each page with the tab at the same index, so a page in
    // the wrong place would swipe to the wrong results.
    await renderResults({ submitted: true });
    expect(mockCapturedFeeds.map((feed) => feed.__sort)).toEqual([
      'top',
      'latest',
    ]);
  });

  it('reports tab changes', async () => {
    const { screen, onTabChange } = await renderResults({ submitted: true });
    fireEvent.press(screen.getByText('People'));
    expect(onTabChange).toHaveBeenCalledWith('people');
  });

  it('lists people with follow buttons on the people tab', async () => {
    mockUserEntries = [{ identity: 'alice' }];

    const { screen } = await renderResults({ submitted: true, tab: 'people' });
    expect(screen.getByText('profile-alice')).toBeTruthy();
    expect(screen.getByText('follow-alice')).toBeTruthy();
  });

  it('omits the follow button for the current identity', async () => {
    mockUserEntries = [{ identity: 'me' }];

    const { screen } = await renderResults({ submitted: true, tab: 'people' });
    expect(screen.getByText('profile-me')).toBeTruthy();
    expect(screen.queryByText('follow-me')).toBeNull();
  });
});
