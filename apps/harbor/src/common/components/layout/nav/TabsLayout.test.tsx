import { render } from '@testing-library/react-native';

let mockCount = 0;
const mockUseUnreadNotificationCount = jest.fn(
  (_enabled?: boolean) => mockCount,
);

jest.mock('expo-router', () => {
  const Stack = () => null;
  Stack.Screen = () => null;
  Stack.Protected = () => null;
  return { Stack };
});

// Leaf stand-ins for the native tab bar; the badge surfaces its text.
jest.mock('expo-router/unstable-native-tabs', () => {
  const react = require('react');
  const { Text, View } = require('react-native');
  const NativeTabs = ({ children }: { children?: unknown }) =>
    react.createElement(View, null, children);
  const Trigger = ({ name, children }: { name: string; children?: unknown }) =>
    react.createElement(View, { testID: `tab-${name}` }, children);
  Trigger.Label = () => null;
  Trigger.Icon = () => null;
  Trigger.Badge = ({ children }: { children?: string }) =>
    react.createElement(Text, { testID: 'badge' }, children);
  NativeTabs.Trigger = Trigger;
  return { NativeTabs };
});

jest.mock('@/src/common/constants', () => ({ openCompose: jest.fn() }));
jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  usePolycentricContext: () => ({
    currentIdentity: { identityKey: 'me' },
    isLoading: false,
    isReady: true,
  }),
}));
jest.mock('@/src/common/theme', () => ({
  useTheme: () => ({
    theme: { palette: new Proxy({}, { get: () => '#000' }) },
  }),
}));
jest.mock('@/src/common/util/platform', () => ({ isIOS: false, isWeb: false }));
jest.mock(
  '@/src/features/notifications/hooks/useUnreadNotificationCount',
  () => ({
    __esModule: true,
    default: (enabled?: boolean) => mockUseUnreadNotificationCount(enabled),
    unreadNotificationsBadgeLabel: (count: number) =>
      count > 0 ? String(count) : null,
  }),
);

import TabsLayout from '@/app/(tabs)/_layout';

beforeEach(() => {
  mockCount = 0;
  mockUseUnreadNotificationCount.mockClear();
});

describe('TabsLayout notifications badge', () => {
  it('subscribes to the count on native', async () => {
    await render(<TabsLayout />);

    expect(mockUseUnreadNotificationCount).toHaveBeenCalledWith(true);
  });

  it('shows the unread count on the Notifications tab', async () => {
    mockCount = 12;

    const { getByTestId, getAllByTestId } = await render(<TabsLayout />);

    expect(getByTestId('badge').props.children).toBe('12');
    expect(getAllByTestId('badge')).toHaveLength(1);
    expect(getByTestId('tab-notifications')).toContainElement(
      getByTestId('badge'),
    );
  });

  it('shows no badge when nothing is unread', async () => {
    const { queryByTestId } = await render(<TabsLayout />);

    expect(queryByTestId('badge')).toBeNull();
  });
});
