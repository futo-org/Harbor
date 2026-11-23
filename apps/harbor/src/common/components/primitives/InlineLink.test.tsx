// A stand-in Link that exposes its props on an RN Text.
jest.mock('expo-router', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    Link: (props: Record<string, unknown>) => react.createElement(Text, props),
  };
});

import { fireEvent, render } from '@testing-library/react-native';
import { InlineLink } from './InlineLink';

test('a press does not reach the surrounding card', async () => {
  const stopPropagation = jest.fn();
  const screen = await render(<InlineLink href="/alice">Alice</InlineLink>);

  await fireEvent.press(screen.getByText('Alice'), { stopPropagation });

  expect(stopPropagation).toHaveBeenCalled();
});

test('it renders an anchor underlined on hover', async () => {
  const screen = await render(<InlineLink href="/alice">Alice</InlineLink>);

  const link = screen.getByText('Alice');
  expect(link.props.href).toBe('/alice');
  expect(link.props.className).toBe('underlineOnHover');
});

test('it can skip the hover underline', async () => {
  const screen = await render(
    <InlineLink href="/alice" underlineOnHover={false}>
      Alice
    </InlineLink>,
  );

  expect(screen.getByText('Alice').props.className).toBeUndefined();
});
