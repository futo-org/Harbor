// React 19's act() refuses to run without this flag; rendering inside act
// keeps the platformVerifiers promise settlement from updating state outside
// of it, which corrupts React's act queue for later tests.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/src/common/theme', () => ({
  useTheme: () => ({
    theme: {
      palette: new Proxy({}, { get: () => '#000' }),
      atoms: new Proxy({}, { get: () => ({}) }),
    },
  }),
  Atoms: new Proxy({}, { get: () => ({}) }),
}));

// Press handlers by title — invoked directly instead of via fireEvent, whose
// internal act() overlaps with the one in renderPicker and breaks later tests.
let mockPress: Record<string, (() => void) | undefined> = {};

jest.mock('@/src/common/components', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    Text: ({ children }: { children?: unknown }) =>
      react.createElement(Text, null, children),
    Button: ({ title, onPress }: { title: string; onPress?: () => void }) => {
      mockPress[title] = onPress;
      return react.createElement(Text, null, title);
    },
  };
});

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const chain: Record<string, unknown> = {};
  chain.duration = () => chain;
  chain.delay = () => chain;
  return { __esModule: true, default: { View }, FadeInDown: chain };
});

jest.mock('../../SelectChip', () => {
  const react = require('react');
  const { Text } = require('react-native');
  return {
    SelectChip: ({
      title,
      onPress,
    }: {
      title: string;
      onPress: () => void;
    }) => {
      mockPress[title] = onPress;
      return react.createElement(Text, null, title);
    },
  };
});

const mockPlatformVerifiers = jest.fn<Promise<Map<string, Set<string>>>, []>();
jest.mock('../../utils/verifier-api', () => ({
  verifierApi: {
    platformVerifiers: (...args: []) => mockPlatformVerifiers(...args),
  },
}));

import { render, screen } from '@testing-library/react-native';
import { act } from 'react';
import { ClaimCreatePlatformPicker } from './ClaimCreatePlatformPicker';

// RN polyfills promises onto setImmediate, so settling the fetch takes real
// ticks that act() alone doesn't drain.
const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

const settle = async (run: () => void) => {
  await act(async () => {
    run();
    await flushPromises();
    await flushPromises();
  });
};

const renderPicker = (onSelect: (...args: unknown[]) => void) =>
  settle(() => render(<ClaimCreatePlatformPicker onSelect={onSelect} />));

describe('ClaimCreatePlatformPicker', () => {
  beforeEach(() => {
    mockPlatformVerifiers.mockReset();
    mockPress = {};
  });

  it('lists supported platforms with the preferred verifier type', async () => {
    mockPlatformVerifiers.mockResolvedValue(
      new Map([
        ['github', new Set(['text'])],
        ['x', new Set(['oauth'])],
      ]),
    );
    const onSelect = jest.fn();
    await renderPicker(onSelect);

    expect(screen.getByText('GitHub')).toBeTruthy();
    expect(screen.queryByText('YouTube')).toBeNull();

    mockPress.GitHub?.();
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'github' }),
      'text',
    );
    mockPress.X?.();
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'x' }),
      'oauth',
    );
  });

  it('shows an error instead of a fallback list when the server is unreachable', async () => {
    mockPlatformVerifiers.mockRejectedValue(new Error('network'));
    await renderPicker(jest.fn());

    expect(screen.getByText(/verification servers/)).toBeTruthy();
    expect(screen.queryByText('GitHub')).toBeNull();
  });

  it('shows the error when no platform is supported', async () => {
    mockPlatformVerifiers.mockResolvedValue(new Map());
    await renderPicker(jest.fn());

    expect(screen.getByText(/verification servers/)).toBeTruthy();
  });

  it('retries after a failure', async () => {
    mockPlatformVerifiers.mockRejectedValueOnce(new Error('network'));
    mockPlatformVerifiers.mockResolvedValue(
      new Map([['github', new Set(['text'])]]),
    );
    await renderPicker(jest.fn());

    await settle(() => mockPress['Try again']?.());

    expect(screen.getByText('GitHub')).toBeTruthy();
    expect(screen.queryByText(/verification servers/)).toBeNull();
  });
});
