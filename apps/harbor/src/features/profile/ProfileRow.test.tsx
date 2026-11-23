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

// Stand-ins that expose whether the avatar, name and handle link.
jest.mock('@/src/common/components/Avatar/ProfileAvatar', () => {
  const react = require('react');
  const { View } = require('react-native');
  return {
    ProfileAvatar: (props: { linkToProfile?: boolean }) =>
      react.createElement(View, {
        testID: 'avatar',
        linkToProfile: props.linkToProfile,
      }),
  };
});
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

import { render, type RenderResult } from '@testing-library/react-native';
import { ProfileRow } from './ProfileRow';

beforeEach(() => {
  mockIsWeb = true;
});

test('on web, in a row linked to the profile, its parts link too', async () => {
  const screen = await render(<ProfileRow identity="alice-id" linkToProfile />);

  expectPartsToLink(screen, true);
});

test.each([
  ['without linkToProfile', {}],
  ['when disabled', { linkToProfile: true, disabled: true }],
  ['when the row has an onPress', { linkToProfile: true, onPress: () => {} }],
])('%s, the parts do not link', async (_, props) => {
  const screen = await render(<ProfileRow identity="alice-id" {...props} />);

  expectPartsToLink(screen, false);
});

test('on native, only the row links to the profile', async () => {
  mockIsWeb = false;
  const screen = await render(<ProfileRow identity="alice-id" linkToProfile />);

  expectPartsToLink(screen, false);
});

function expectPartsToLink(screen: RenderResult, linked: boolean) {
  expect(screen.getByTestId('avatar').props.linkToProfile).toBe(linked);
  expect(screen.getByText('Alice').props.linkToProfile).toBe(linked);
  expect(screen.getByText('alice@example.com').props.linkToProfile).toBe(
    linked,
  );
}
