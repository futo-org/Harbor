import { render } from '@testing-library/react-native';

// What the mocked hooks report; tests reassign these between renders.
let mockFocused = true;
let mockList = {
  items: [] as unknown[],
  isLoading: false,
  isRefreshing: false,
  refresh: jest.fn(),
};
const mockAcknowledge = jest.fn(async () => {});

jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

jest.mock('./hooks/useListNotifications', () => ({
  __esModule: true,
  default: () => mockList,
}));

jest.mock('./hooks/useUnreadNotificationCount', () => ({
  useAcknowledgeNotifications: () => mockAcknowledge,
}));

jest.mock('@/src/common/lib/navigation/useEagerLoad', () => ({
  useEagerLoad: () => true,
}));
jest.mock('@/src/common/lib/navigation/useFocusedRefresh', () => ({
  useFocusedRefresh: () => undefined,
}));
jest.mock('@/src/common/lib/navigation/usePageTitle', () => ({
  usePageTitle: () => undefined,
}));

// Inert stubs for the list and chrome; only the acknowledge effect is
// under test.
jest.mock('@/src/common/components/List', () => {
  const react = require('react');
  const { View } = require('react-native');
  return {
    List: react.forwardRef(() => react.createElement(View, { testID: 'list' })),
  };
});
jest.mock('@/src/common/components/layout', () => {
  const react = require('react');
  const { View } = require('react-native');
  const Screen = ({ children }: { children?: unknown }) =>
    react.createElement(View, null, children);
  Screen.PrimaryColumn = Screen;
  return { Screen };
});
jest.mock('@/src/common/components/layout/Topbar', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/src/common/components/PullRefreshControl', () => ({
  PullRefreshControl: () => null,
}));
jest.mock('@/src/common/components', () => ({ Text: () => null }));
jest.mock('./Notification', () => ({ __esModule: true, default: () => null }));
jest.mock('@/src/common/theme', () => ({
  Atoms: new Proxy({}, { get: () => ({}) }),
}));
jest.mock('@/src/common/util/platform', () => ({ isWeb: false }));

import NotificationsScreen from './NotificationsScreen';

beforeEach(() => {
  mockFocused = true;
  mockList = {
    items: [],
    isLoading: false,
    isRefreshing: false,
    refresh: jest.fn(),
  };
  mockAcknowledge.mockClear();
});

describe('NotificationsScreen acknowledging', () => {
  it('acknowledges once the focused list has loaded', async () => {
    await render(<NotificationsScreen />);

    expect(mockAcknowledge).toHaveBeenCalledTimes(1);
  });

  it('waits for the list to load', async () => {
    mockList = { ...mockList, isLoading: true };
    const { rerender } = await render(<NotificationsScreen />);
    expect(mockAcknowledge).not.toHaveBeenCalled();

    mockList = { ...mockList, isLoading: false };
    await rerender(<NotificationsScreen />);
    expect(mockAcknowledge).toHaveBeenCalledTimes(1);
  });

  it('acknowledges again once a refresh has finished', async () => {
    const { rerender } = await render(<NotificationsScreen />);
    expect(mockAcknowledge).toHaveBeenCalledTimes(1);

    mockList = { ...mockList, isRefreshing: true };
    await rerender(<NotificationsScreen />);
    expect(mockAcknowledge).toHaveBeenCalledTimes(1);

    mockList = { ...mockList, isRefreshing: false };
    await rerender(<NotificationsScreen />);
    expect(mockAcknowledge).toHaveBeenCalledTimes(2);
  });

  it('waits for focus', async () => {
    mockFocused = false;
    const { rerender } = await render(<NotificationsScreen />);
    expect(mockAcknowledge).not.toHaveBeenCalled();

    mockFocused = true;
    await rerender(<NotificationsScreen />);
    expect(mockAcknowledge).toHaveBeenCalledTimes(1);
  });

  it('does not acknowledge on an unrelated re-render', async () => {
    const { rerender } = await render(<NotificationsScreen />);
    await rerender(<NotificationsScreen />);

    expect(mockAcknowledge).toHaveBeenCalledTimes(1);
  });
});
