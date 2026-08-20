// Global test setup. jest-expo's preset owns `setupFiles` (React Native + Expo
// native setup), so project-wide additions live here via `setupFilesAfterEnv`
// to avoid clobbering that array.

// AsyncStorage has no native module under Jest; use the package's official mock
// so anything that persists settings (theme, link-preview toggle, …) works in
// tests instead of throwing "NativeModule: AsyncStorage is null".
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// `expo-font` requires `expo-asset` even though it is not declared as a
// dependency. We set this mock to provide a placeholder icon component when
// required.
jest.mock('@expo/vector-icons', () => new Proxy({}, { get: () => () => null }));

// Reanimated wants the worklets native module on import, and its own `mock`
// entry point re-imports the real thing. Stub the surface we use.
jest.mock('react-native-reanimated', () => {
  const { ScrollView, View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View,
      ScrollView,
      createAnimatedComponent: (component) => component,
    },
    useSharedValue: (initial) => ({ value: initial }),
    useAnimatedStyle: (updater) => updater(),
    useAnimatedScrollHandler: () => () => undefined,
    useAnimatedReaction: () => undefined,
    withTiming: (toValue) => toValue,
    withRepeat: (animation) => animation,
    cancelAnimation: () => undefined,
    Easing: new Proxy({}, { get: () => (value) => value }),
    runOnJS: (fn) => fn,
  };
});

// Same story as reanimated: importing it reaches for the native module.
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn, ...args) => fn(...args),
  runOnJS: (fn) => fn,
}));

// Native UITextView; the base Text is its own non-iOS fallback.
jest.mock('@bsky.app/react-native-uitextview', () => ({
  UITextView: require('react-native').Text,
}));

// Renders pages as plain children under test, and stubs the page controls.
jest.mock('@expo/ui/community/pager-view', () => {
  const react = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: react.forwardRef((props, ref) => {
      react.useImperativeHandle(ref, () => ({
        setPage: () => {},
        setPageWithoutAnimation: () => {},
        setScrollEnabled: () => {},
      }));
      return react.createElement(View, props);
    }),
  };
});
