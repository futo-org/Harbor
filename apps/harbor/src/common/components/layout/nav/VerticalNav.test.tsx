import { render } from '@testing-library/react-native';

let mockIdentity: { identityKey: string } | null = { identityKey: 'me' };
let mockCount = 0;
const mockUseUnreadNotificationCount = jest.fn(() => mockCount);

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  useCurrentIdentity: () => ({ identity: mockIdentity }),
}));

// Mirrors the real label rule (covered by the hook's own test).
jest.mock(
  '@/src/features/notifications/hooks/useUnreadNotificationCount',
  () => ({
    __esModule: true,
    default: () => mockUseUnreadNotificationCount(),
    unreadNotificationsBadgeLabel: (count: number) =>
      count > 0 ? String(count) : null,
  }),
);

let mockAnywhereEnabled = false;
let mockCalendarEventsEnabled = false;
jest.mock('@/src/common/feature-flags', () => ({
  useFeatureFlag: (flag: string) =>
    flag === 'calendar-events'
      ? mockCalendarEventsEnabled
      : mockAnywhereEnabled,
}));

jest.mock('@/src/common/components/Icon', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/src/common/theme', () => ({
  Atoms: new Proxy({}, { get: () => ({}) }),
}));

// A leaf that surfaces the props the nav hands each item.
jest.mock('./NavItem', () => {
  const react = require('react');
  const { View } = require('react-native');
  return {
    NavItem: ({ label, badge }: { label: string; badge?: string | null }) =>
      react.createElement(View, { testID: `nav-${label}`, badge }),
  };
});

import { VerticalNav } from './VerticalNav';

beforeEach(() => {
  mockIdentity = { identityKey: 'me' };
  mockCount = 0;
  mockAnywhereEnabled = false;
  mockCalendarEventsEnabled = false;
  mockUseUnreadNotificationCount.mockClear();
});

describe('VerticalNav Anywhere item', () => {
  it('is left out while its feature flag is off', async () => {
    const { queryByTestId } = await render(<VerticalNav />);

    expect(queryByTestId('nav-Anywhere')).toBeNull();
  });

  it('is there once the flag is on', async () => {
    mockAnywhereEnabled = true;

    const { getByTestId } = await render(<VerticalNav />);

    expect(getByTestId('nav-Anywhere')).toBeTruthy();
  });
});

describe('VerticalNav Events item', () => {
  it('is left out while its feature flag is off', async () => {
    const { queryByTestId } = await render(<VerticalNav />);

    expect(queryByTestId('nav-Events')).toBeNull();
  });

  it('is there once the flag is on', async () => {
    mockCalendarEventsEnabled = true;

    const { getByTestId } = await render(<VerticalNav />);

    expect(getByTestId('nav-Events')).toBeTruthy();
  });
});

describe('VerticalNav notifications badge', () => {
  it('shows the unread count on the Notifications item', async () => {
    mockCount = 5;

    const { getByTestId } = await render(<VerticalNav />);

    expect(getByTestId('nav-Notifications').props.badge).toBe('5');
  });

  it('shows no badge when nothing is unread', async () => {
    const { getByTestId } = await render(<VerticalNav />);

    expect(getByTestId('nav-Notifications').props.badge).toBeNull();
  });

  it('leaves the other items without a badge', async () => {
    mockCount = 5;

    const { getByTestId } = await render(<VerticalNav />);

    expect(getByTestId('nav-Home').props.badge).toBeUndefined();
    expect(getByTestId('nav-Explore').props.badge).toBeUndefined();
  });

  it('has no Notifications item while signed out', async () => {
    mockIdentity = null;

    const { queryByTestId } = await render(<VerticalNav />);

    expect(queryByTestId('nav-Notifications')).toBeNull();
  });
});
