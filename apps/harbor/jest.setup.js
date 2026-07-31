// Global test setup. jest-expo's preset owns `setupFiles` (React Native + Expo
// native setup), so project-wide additions live here via `setupFilesAfterEnv`
// to avoid clobbering that array.

// AsyncStorage has no native module under Jest; use the package's official mock
// so anything that persists settings (theme, link-preview toggle, …) works in
// tests instead of throwing "NativeModule: AsyncStorage is null".
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
