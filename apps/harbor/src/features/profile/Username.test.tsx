jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  useUsername: () => 'Alice',
}));
jest.mock('@/src/features/moderation/LabelPill', () => ({
  LabelPill: () => null,
}));
jest.mock('./hooks/useProfileModeration', () => ({
  useProfileModeration: () => ({ obscured: false, revealed: false }),
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
import { Username } from './Username';

test('with linkToProfile, the name links to the profile', async () => {
  const screen = await render(<Username identity="alice-id" linkToProfile />);

  expect(screen.getByText('Alice').props.href).toBe('/alice-id');
});

test('without linkToProfile, the name is plain text', async () => {
  const screen = await render(<Username identity="alice-id" />);

  expect(screen.getByText('Alice').props.href).toBeUndefined();
});
