jest.mock('./hooks/useIdentityHandle', () => ({
  useIdentityHandle: () => ({ kind: 'alias', text: 'alice@example.com' }),
}));
jest.mock('@/src/common/theme', () => ({
  Atoms: { faded: {} },
  createThemedStyles: () => () => ({}),
}));

// Plain RN Texts; the link stand-in exposes its href.
jest.mock('@/src/common/components/primitives/Text', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    Text: (props: { children: unknown }) =>
      react.createElement(Text, null, props.children),
  };
});
jest.mock('@/src/common/components/primitives/InlineLink', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    InlineLink: (props: { href: string; children: string }) =>
      react.createElement(Text, { href: props.href }, props.children),
  };
});

import { render } from '@testing-library/react-native';
import { IdentityHandle } from './IdentityHandle';

test('with linkToProfile, the handle links to the profile', async () => {
  const screen = await render(
    <IdentityHandle identity="alice-id" linkToProfile />,
  );

  expect(screen.getByText('alice@example.com').props.href).toBe('/alice-id');
});

test('without linkToProfile, the handle is plain text', async () => {
  const screen = await render(<IdentityHandle identity="alice-id" />);

  expect(screen.getByText('alice@example.com').props.href).toBeUndefined();
});
