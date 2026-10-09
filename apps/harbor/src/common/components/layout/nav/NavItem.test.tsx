import { render } from '@testing-library/react-native';

jest.mock('expo-router', () => {
  const react = require('react');
  const { View } = require('react-native');
  return {
    Link: ({ children, ...props }: { children?: unknown }) =>
      react.createElement(View, props, children),
    router: { canDismiss: () => false, navigate: jest.fn() },
    usePathname: () => '/feed',
  };
});

jest.mock('@/src/common/lib/navigation/useFocusedRefresh', () => ({
  emitFocusedRefresh: jest.fn(),
}));

jest.mock('@/src/common/components/primitives', () => {
  const { Text } = require('react-native');
  return { Text };
});

jest.mock('@/src/common/theme', () => ({
  Atoms: new Proxy({}, { get: () => ({}) }),
  Breakpoints: { xl: 1280 },
  useTheme: () => ({
    theme: {
      palette: {
        neutral_900: '#000',
        neutral_25: '#eee',
        neutral_50: '#ddd',
        primary_200: '#f90',
      },
    },
  }),
}));

jest.mock('@/src/utils/router', () => ({
  flattenHref: (href: unknown) =>
    typeof href === 'string' ? href : (href as { pathname: string })?.pathname,
}));

import { View } from 'react-native';
import { NavItem } from './NavItem';

describe('NavItem badge', () => {
  it('draws the badge text over the icon', async () => {
    const { getByText } = await render(
      <NavItem
        label="Notifications"
        icon={<View />}
        href="/notifications"
        badge="5"
        showLabel={false}
      />,
    );

    expect(getByText('5')).toBeTruthy();
  });

  it('draws nothing without a badge', async () => {
    const { queryByText } = await render(
      <NavItem
        label="Notifications"
        icon={<View />}
        href="/notifications"
        badge={null}
        showLabel
      />,
    );

    expect(queryByText('5')).toBeNull();
    expect(queryByText('Notifications')).toBeTruthy();
  });
});
