import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, createRef } from 'react';
import TestRenderer from 'react-test-renderer';
import type { ListRef } from '@/src/common/components/List';
import { useFeedSettingsStore } from './useFeedSettingsStore';
import { useFeedTab, useFeedTabPress } from './useFeedTabs';

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

beforeEach(async () => {
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

describe('useFeedTab', () => {
  it('defaults the home feed to latest and explore to top', async () => {
    await useFeedSettingsStore.persist.rehydrate();

    const following = await renderHook(() => useFeedTab('following'));
    const explore = await renderHook(() => useFeedTab('explore'));

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

    const result = await renderHook(() => useFeedTab('following'));
    expect(result.current.tab).toBe('for-you');
    expect(result.current.hydrated).toBe(true);
  });

  it('persists a tab change', async () => {
    await useFeedSettingsStore.persist.rehydrate();

    act(() => {
      useFeedSettingsStore.getState().setFeedSettings('following', {
        tab: 'for-you',
      });
    });

    const stored = await AsyncStorage.getItem(STORE_KEY);
    expect(JSON.parse(stored ?? '{}').state.feeds).toEqual({
      following: { tab: 'for-you' },
      explore: { tab: 'top' },
    });
  });
});

describe('useFeedTabPress', () => {
  it('selects a different tab', async () => {
    await useFeedSettingsStore.persist.rehydrate();
    const listRef = createRef<ListRef>();
    const refresh = jest.fn();

    const onTabPress = await renderHook(() =>
      useFeedTabPress('following', listRef, refresh),
    );
    act(() => {
      onTabPress.current('for-you');
    });

    expect(useFeedSettingsStore.getState().feeds.following.tab).toBe('for-you');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('scrolls to the top and refreshes when the active tab is re-tapped', async () => {
    await useFeedSettingsStore.persist.rehydrate();
    const scrollToTop = jest.fn();
    const listRef = createRef<ListRef>();
    listRef.current = { scrollToTop } as unknown as ListRef;
    const refresh = jest.fn();

    const onTabPress = await renderHook(() =>
      useFeedTabPress('following', listRef, refresh),
    );
    act(() => {
      onTabPress.current('latest');
    });

    expect(scrollToTop).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
    expect(useFeedSettingsStore.getState().feeds.following.tab).toBe('latest');
  });
});
