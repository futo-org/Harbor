jest.mock('@/src/common/theme', () => ({
  useTheme: () => ({
    theme: {
      palette: new Proxy({}, { get: () => '#000' }),
      atoms: new Proxy({}, { get: () => ({}) }),
    },
  }),
  Atoms: new Proxy({}, { get: () => ({}) }),
  BorderRadius: { full: 999 },
}));

jest.mock('@/src/common/components/primitives', () => ({
  Text: ({ children }: { children?: unknown }) => {
    const react = require('react');
    const { Text } = require('react-native');
    return react.createElement(Text, null, children);
  },
}));

jest.mock('@/src/common/components/Icon', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) =>
      react.createElement(Text, { testID: `icon-${name}` }, name),
  };
});

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    LinearTransition: {},
    useSharedValue: (initial: number) => ({ value: initial }),
    useAnimatedStyle: (updater: () => object) => updater(),
    withTiming: (
      toValue: number,
      _config: object,
      callback?: (finished: boolean) => void,
    ) => {
      // Throw away `withTiming` completion callback so closing a toast removes
      // it from the store.
      callback?.(true);
      return toValue;
    },
  };
});

const mockClosePress = jest.fn();
jest.mock('@rn-primitives/toast', () => {
  const react = require('react');
  const { View } = require('react-native');
  const passthrough = ({ children }: { children?: unknown }) =>
    react.createElement(react.Fragment, null, children);
  return {
    Root: ({ children }: { children?: unknown }) =>
      react.createElement(View, null, children),
    Title: passthrough,
    Description: passthrough,
    Close: ({ children }: { children: React.ReactElement }) =>
      react.cloneElement(children, { onPress: mockClosePress }),
  };
});

import { fireEvent, render } from '@testing-library/react-native';
import { Toast } from './Toast';
import { useToastStore } from './useToastStore';

const current = () => useToastStore.getState().toasts;

beforeEach(() => {
  useToastStore.getState().dismissAll();
});

describe('pressable toast', () => {
  it('is stored with the toast', () => {
    const onPress = jest.fn();
    useToastStore.getState().show('Title', { onPress });
    expect(current()[0].onPress).toBe(onPress);
  });

  it('is not a button without onPress', async () => {
    useToastStore.getState().show('Title');
    const screen = await render(<Toast toast={current()[0]} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('runs onPress and dismisses when pressed anywhere', async () => {
    const onPress = jest.fn();
    useToastStore.getState().show('Title', { duration: null, onPress });
    const screen = await render(<Toast toast={current()[0]} />);

    await fireEvent.press(screen.getByText('Title'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(current()).toHaveLength(0);
  });

  it('only closes when the close button is pressed', async () => {
    const onPress = jest.fn();
    useToastStore.getState().show('Title', { duration: null, onPress });
    const screen = await render(<Toast toast={current()[0]} />);

    await fireEvent.press(screen.getByTestId('icon-close'));

    expect(mockClosePress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });
});
