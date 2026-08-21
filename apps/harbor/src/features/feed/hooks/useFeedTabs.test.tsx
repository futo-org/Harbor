import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { emitFocusedRefresh } from '@/src/common/lib/navigation/useFocusedRefresh';
import { useFeedSettingsStore } from './useFeedSettingsStore';
import { useFeedTabs } from './useFeedTabs';

jest.mock('@/src/common/lib/navigation/useFocusedRefresh', () => ({
  emitFocusedRefresh: jest.fn(),
}));

const STORE_KEY = 'polycentric:feed-settings-v3';

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
      feeds: {
        following: { tab: 'following', sort: 'latest' },
        explore: { tab: 'posts', sort: 'top' },
      },
    });
  });
});

afterEach(() => {
  act(() => {
    for (const renderer of renderers.splice(0)) renderer.unmount();
  });
});

describe('useFeedTabs selection', () => {
  it('defaults home to following/latest and explore to posts/top', async () => {
    await useFeedSettingsStore.persist.rehydrate();

    const following = await renderTabs('following');
    const explore = await renderTabs('explore');

    expect(following.current.tab).toBe('following');
    expect(useFeedSettingsStore.getState().feeds.following.sort).toBe('latest');
    expect(explore.current.tab).toBe('posts');
    expect(useFeedSettingsStore.getState().feeds.explore.sort).toBe('top');
  });

  it('hydrates the stored selection', async () => {
    await AsyncStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        state: {
          feeds: {
            following: { tab: 'for-you', sort: 'top' },
            explore: { tab: 'posts', sort: 'top' },
          },
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
      following: { tab: 'for-you', sort: 'latest' },
      explore: { tab: 'posts', sort: 'top' },
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
      tabs.current.onTabPress('following');
    });

    expect(emitFocusedRefresh).toHaveBeenCalled();
    expect(useFeedSettingsStore.getState().feeds.following.tab).toBe(
      'following',
    );
  });
});
