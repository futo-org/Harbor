import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { useSettings } from './index';
import { useOmitLabels } from './useOmitLabels';

// Test 1: useOmitLabels reads moderation preferences from the zustand store

type LabelsResult = string[];

function renderOmitLabelsHook(): { result: { current: LabelsResult } } {
  const result: { current: LabelsResult } = { current: [] };
  function Probe() {
    result.current = useOmitLabels();
    return null;
  }
  act(() => {
    TestRenderer.create(<Probe />);
  });
  return { result };
}

// Probes from earlier tests stay mounted, so setState here re-renders
// them outside act(). Wrap the reset so those renders are flushed by React.
function resetModeration() {
  act(() => {
    useSettings.setState({
      moderation: {
        hate: 'warn',
        'self-harm': 'warn',
        'sexually-suggestive': 'warn',
        'sexually-explicit': 'warn',
        violence: 'warn',
      },
    });
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  // Reset to the default state so tests don't leak.
  resetModeration();
});

describe('useOmitLabels', () => {
  it('returns an empty array when no categories are hidden', () => {
    const { result } = renderOmitLabelsHook();
    expect(result.current).toEqual([]);
  });

  it('returns the label string for a single hidden category', async () => {
    await act(async () =>
      useSettings.getState().setModeration({ 'sexually-suggestive': 'hide' }),
    );
    const { result } = renderOmitLabelsHook();
    expect(result.current).toEqual(['sexually-suggestive']);
  });

  it('includes all hidden categories', async () => {
    await act(async () =>
      useSettings.getState().setModeration({
        hate: 'hide',
        violence: 'hide',
        'self-harm': 'hide',
      }),
    );
    const { result } = renderOmitLabelsHook();
    expect(result.current).toEqual(
      expect.arrayContaining(['hate', 'violence', 'self-harm']),
    );
    expect(result.current).toHaveLength(3);
  });

  it('drops a category when its level is changed away from hide', async () => {
    await act(async () =>
      useSettings.getState().setModeration({ 'sexually-explicit': 'hide' }),
    );
    const { result: r1 } = renderOmitLabelsHook();
    expect(r1.current).toEqual(['sexually-explicit']);

    await act(async () =>
      useSettings.getState().setModeration({ 'sexually-explicit': 'warn' }),
    );
    const { result: r2 } = renderOmitLabelsHook();
    expect(r2.current).toEqual([]);
  });

  it('returns every moderation label when all are hidden', async () => {
    await act(async () =>
      useSettings.getState().setModeration({
        hate: 'hide',
        'self-harm': 'hide',
        'sexually-suggestive': 'hide',
        'sexually-explicit': 'hide',
        violence: 'hide',
      }),
    );
    const { result } = renderOmitLabelsHook();
    expect(result.current).toEqual(
      expect.arrayContaining([
        'hate',
        'self-harm',
        'sexually-suggestive',
        'sexually-explicit',
        'violence',
      ]),
    );
    expect(result.current).toHaveLength(5);
  });

  it('reactively updates when settings change after initial render', async () => {
    const { result } = renderOmitLabelsHook();
    expect(result.current).toEqual([]);

    await act(async () =>
      useSettings.getState().setModeration({ 'sexually-suggestive': 'hide' }),
    );
    expect(result.current).toEqual(['sexually-suggestive']);
  });

  it('is unaffected by non-moderation setting changes', async () => {
    await act(async () =>
      useSettings.getState().setModeration({ hate: 'hide' }),
    );
    const { result } = renderOmitLabelsHook();
    expect(result.current).toEqual(['hate']);

    // Changing theme should NOT drop 'hate' from the omit list.
    await act(async () => useSettings.getState().setTheme('dark'));
    expect(result.current).toEqual(['hate']);
  });
});

// Test 2: Feed hooks pass omitLabels into the Query constructor
// We only test useExploreFeed, assuming it is representative of the other three feed hooks.

// Capture the factory function useQuery receives so we can inspect its output.
// The mocked Query stub copies its constructor args onto itself, so the built
// query reads back as the args object the hook passed in.
type CapturedQuery = { omitLabels: string[] };
type QueryFactory = (status: unknown, data: unknown) => CapturedQuery;

let capturedFactory: QueryFactory | null = null;

// Narrows away the `null` the capture variable starts out as.
function callCapturedFactory(status: unknown, data: unknown): CapturedQuery {
  if (!capturedFactory) throw new Error('useQuery factory was never captured');
  return capturedFactory(status, data);
}

jest.mock('@/src/common/query/hooks/useQuery', () => ({
  useQuery: (
    _key: unknown,
    factory: QueryFactory,
    _opts: unknown,
    _enabled: boolean,
  ) => {
    capturedFactory = factory;
    return {
      data: null,
      status: 'loading',
      hasPendingRefresh: false,
      error: null,
      refresh: jest.fn(),
      extend: jest.fn(),
    };
  },
  RefreshStrategy: { Lazy: 'lazy' },
}));

jest.mock('@polycentric/react-native', () => {
  const actual = jest.requireActual(
    '../../../../../packages/js-core/src/proto/v2',
  );

  return {
    v2: actual,
    // The real Query enum is uniffi-generated and needs native init, which
    // can't run under jest. This stub keeps the args it was constructed with so
    // the tests can assert on what the hook passed in.
    Query: {
      GetExploreFeed: class GetExploreFeed {
        constructor(args: Record<string, unknown>) {
          Object.assign(this, args);
        }
      },
    },
    QueryStatus: { Loading: 'loading' },
    UpdateMode: { Merge: 'merge' },
    FeedSort: { Default: 'default', Top: 'top', Latest: 'latest' },
  };
});

jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  shouldExtend: () => true,
  extractFeedToken: () => undefined,
  usePolycentricContext: () => ({
    client: { activeIdentityKey: 'test-identity' },
  }),
  decodeV2PostBundle: jest.fn(),
}));

describe('useExploreFeed — omitLabels wiring', () => {
  beforeEach(() => {
    capturedFactory = null;
    resetModeration();
  });

  function renderFeedHook() {
    // useExploreFeed is imported lazily so mocks are in place.
    const { useExploreFeed } = jest.requireActual(
      '@/src/features/feed/hooks/useExploreFeed',
    );
    function Probe() {
      useExploreFeed({ enabled: true });
      return null;
    }
    act(() => {
      TestRenderer.create(<Probe />);
    });
  }

  it('passes omitLabels = [] when no categories are hidden', () => {
    renderFeedHook();
    expect(capturedFactory).not.toBeNull();
    const result = callCapturedFactory(undefined, undefined);
    expect(result).toHaveProperty('omitLabels');
    expect(result.omitLabels).toEqual([]);
  });

  it('passes the hidden label strings when moderation is set to hide', async () => {
    await act(async () =>
      useSettings.getState().setModeration({
        hate: 'hide',
        'sexually-suggestive': 'hide',
      }),
    );

    renderFeedHook();
    expect(capturedFactory).not.toBeNull();
    const result = callCapturedFactory(undefined, undefined);
    expect(result.omitLabels).toEqual(
      expect.arrayContaining(['hate', 'sexually-suggestive']),
    );
    expect(result.omitLabels).toHaveLength(2);
  });

  it('reactively re-queries when settings change after mount', async () => {
    renderFeedHook();
    const initialResult = callCapturedFactory(undefined, undefined);
    expect(initialResult.omitLabels).toEqual([]);

    // Simulate the hook re-running its query factory with updated omitLabels.
    await act(async () =>
      useSettings.getState().setModeration({ violence: 'hide' }),
    );
    expect(capturedFactory).not.toBeNull();
    const factoryResult = callCapturedFactory('loading', null);
    expect(factoryResult).toHaveProperty('omitLabels', ['violence']);
  });
});
