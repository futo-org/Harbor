jest.mock('@/src/common/theme', () => ({
  Atoms: new Proxy({}, { get: () => ({}) }),
  createThemedStyles: () => () => ({}),
}));

// A stand-in that exposes the props the image receives.
jest.mock('expo-image', () => {
  const react = require('react');
  const { View } = require('react-native');
  return {
    Image: (props: Record<string, unknown>) =>
      react.createElement(View, { ...props, testID: 'image' }),
  };
});

import { render } from '@testing-library/react-native';
import { Avatar } from './Avatar';

test('under <Link asChild>, the pressable avatar becomes the anchor', async () => {
  const screen = await render(
    // What `<Link asChild>` passes to its child.
    <Avatar
      href="/alice"
      role="link"
      onClick={jest.fn()}
      onPress={jest.fn()}
    />,
  );

  const link = screen.getByRole('link');
  expect(link.props.href).toBe('/alice');
  expect(screen.getByTestId('image').props.onClick).toBeUndefined();
});
