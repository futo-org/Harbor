import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { emitFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';
import { useFeedSettingsStore } from './useFeedSettingsStore';
import { useFeedTabs } from './useFeedTabs';

jest.mock('@/src/common/lib/navigation/useFocusedRefresh', () => ({
  emitFocusedRefresh: jest.fn(),
}));

const STORE_KEY = 'polycentric:feed-settings';

const renderers: TestRenderer.ReactTestRenderer[] = [];

/** Render `hook` in a probe component; `result.current` tracks its value. */
async function renderHook<T>(hook: () => T): Promise<{ current: T }> {
  const result = { current: undefined as unknown as T };
  function Probe() {
    result.current = hook();
    return null;
  }
  await act(async () => {
    renderers.push(TestRenderer.create(<Probe />));
  });
  return result;
}

const renderTabs = (feed: 'following' | 'explore' = 'following') =>
  renderHook(() => useFeedTabs(feed));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  act(() => {
    useFeedSettingsStore.setState({
      feeds: { following: { tab: 'latest' }, explore: { tab: 'top' } },
    });
  });
});

afterEach(() => {
  act(() => {
    for (const renderer of renderers.splice(0)) renderer.unmount();
  });
});

describe('useFeedTabs selection', () => {
  it('defaults the home feed to latest and explore to top', async () => {
    await useFeedSettingsStore.persist.rehydrate();

    const following = await renderTabs('following');
    const explore = await renderTabs('explore');

    expect(following.current.tab).toBe('latest');
    expect(explore.current.tab).toBe('top');
  });

  it('hydrates the stored selection', async () => {
    await AsyncStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        state: {
          feeds: { following: { tab: 'for-you' }, explore: { tab: 'top' } },
        },
      }),
    );
    await useFeedSettingsStore.persist.rehydrate();

    const result = await renderTabs();
    expect(result.current.tab).toBe('for-you');
    expect(result.current.hydrated).toBe(true);
  });

  it('persists a tab change', async () => {
    await useFeedSettingsStore.persist.rehydrate();
    const tabs = await renderTabs();

    act(() => {
      tabs.current.onTabPress('for-you');
    });

    const stored = await AsyncStorage.getItem(STORE_KEY);
    expect(JSON.parse(stored ?? '{}').state.feeds).toEqual({
      following: { tab: 'for-you' },
      explore: { tab: 'top' },
    });
  });
});

describe('useFeedTabs re-tap', () => {
  it('does not emit when another tab is selected', async () => {
    await useFeedSettingsStore.persist.rehydrate();
    const tabs = await renderTabs();

    act(() => {
      tabs.current.onTabPress('for-you');
    });

    expect(useFeedSettingsStore.getState().feeds.following.tab).toBe('for-you');
    expect(emitFocusedRefresh).not.toHaveBeenCalled();
  });

  it('emits a focused refresh when the active tab is selected again', async () => {
    await useFeedSettingsStore.persist.rehydrate();
    const tabs = await renderTabs();

    act(() => {
      tabs.current.onTabPress('latest');
    });

    expect(emitFocusedRefresh).toHaveBeenCalled();
    expect(useFeedSettingsStore.getState().feeds.following.tab).toBe('latest');
  });
});
