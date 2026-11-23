let mockIsWeb = true;
jest.mock('@/src/common/util/platform', () => ({
  get isWeb() {
    return mockIsWeb;
  },
}));

jest.mock('@/src/common/theme', () => ({
  useTheme: () => ({
    theme: { atoms: { box: { primary: { bg_hover: {} } } } },
  }),
  Atoms: new Proxy({}, { get: () => ({}) }),
}));

jest.mock('./hooks/useProfile', () => ({ useProfile: () => ({}) }));
jest.mock('@/src/common/lib/navigation/useCardLinkPress', () => ({
  useCardLinkPress: () => ({}),
}));
jest.mock('@/src/common/components/Avatar/ProfileAvatar', () => ({
  ProfileAvatar: () => null,
}));

// Stand-ins that expose whether the name and handle link.
jest.mock('./Username', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    Username: (props: { linkToProfile?: boolean }) =>
      react.createElement(
        Text,
        { linkToProfile: props.linkToProfile },
        'Alice',
      ),
  };
});
jest.mock('./IdentityHandle', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    IdentityHandle: (props: { linkToProfile?: boolean }) =>
      react.createElement(
        Text,
        { linkToProfile: props.linkToProfile },
        'alice@example.com',
      ),
  };
});

import { render } from '@testing-library/react-native';
import { ProfileRow } from './ProfileRow';

beforeEach(() => {
  mockIsWeb = true;
});

test('on web, in a row linked to the profile, the name and handle link too', async () => {
  const screen = await render(<ProfileRow identity="alice-id" linkToProfile />);

  expect(screen.getByText('Alice').props.linkToProfile).toBe(true);
  expect(screen.getByText('alice@example.com').props.linkToProfile).toBe(true);
});

test.each([
  ['without linkToProfile', {}],
  ['when disabled', { linkToProfile: true, disabled: true }],
  ['when the row has an onPress', { linkToProfile: true, onPress: () => {} }],
])('%s, the name and handle do not link', async (_, props) => {
  const screen = await render(<ProfileRow identity="alice-id" {...props} />);

  expect(screen.getByText('Alice').props.linkToProfile).toBe(false);
  expect(screen.getByText('alice@example.com').props.linkToProfile).toBe(false);
});

test('on native, only the row links to the profile', async () => {
  mockIsWeb = false;
  const screen = await render(<ProfileRow identity="alice-id" linkToProfile />);

  expect(screen.getByText('Alice').props.linkToProfile).toBe(false);
  expect(screen.getByText('alice@example.com').props.linkToProfile).toBe(false);
});
