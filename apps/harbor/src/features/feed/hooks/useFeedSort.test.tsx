import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, createRef } from 'react';
import TestRenderer from 'react-test-renderer';
import type { ListRef } from '@/src/common/components/List';
import { useFeedSettingsStore } from './useFeedSettingsStore';
import { useFeedSort, useFeedSortPress } from './useFeedSort';

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
      feeds: { following: { sort: 'latest' }, explore: { sort: 'top' } },
    });
  });
});

afterEach(() => {
  act(() => {
    for (const renderer of renderers.splice(0)) renderer.unmount();
  });
});

describe('useFeedSort', () => {
  it('defaults the following feed to latest and explore to top', async () => {
    await useFeedSettingsStore.persist.rehydrate();

    const following = await renderHook(() => useFeedSort('following'));
    const explore = await renderHook(() => useFeedSort('explore'));

    expect(following.current.sort).toBe('latest');
    expect(explore.current.sort).toBe('top');
  });

  it('hydrates the stored selection', async () => {
    await AsyncStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        state: {
          feeds: { following: { sort: 'top' }, explore: { sort: 'top' } },
        },
      }),
    );
    await useFeedSettingsStore.persist.rehydrate();

    const result = await renderHook(() => useFeedSort('following'));
    expect(result.current.sort).toBe('top');
    expect(result.current.hydrated).toBe(true);
  });

  it('persists a tab change', async () => {
    await useFeedSettingsStore.persist.rehydrate();

    act(() => {
      useFeedSettingsStore.getState().setFeedSettings('following', {
        sort: 'top',
      });
    });

    const stored = await AsyncStorage.getItem(STORE_KEY);
    expect(JSON.parse(stored ?? '{}').state.feeds).toEqual({
      following: { sort: 'top' },
      explore: { sort: 'top' },
    });
  });
});

describe('useFeedSortPress', () => {
  it('selects a different sort', async () => {
    await useFeedSettingsStore.persist.rehydrate();
    const listRef = createRef<ListRef>();
    const refresh = jest.fn();

    const onSortPress = await renderHook(() =>
      useFeedSortPress('following', listRef, refresh),
    );
    act(() => {
      onSortPress.current('top');
    });

    expect(useFeedSettingsStore.getState().feeds.following.sort).toBe('top');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('scrolls to the top and refreshes when the active sort is re-tapped', async () => {
    await useFeedSettingsStore.persist.rehydrate();
    const scrollToTop = jest.fn();
    const listRef = createRef<ListRef>();
    listRef.current = { scrollToTop } as unknown as ListRef;
    const refresh = jest.fn();

    const onSortPress = await renderHook(() =>
      useFeedSortPress('following', listRef, refresh),
    );
    act(() => {
      onSortPress.current('latest');
    });

    expect(scrollToTop).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
    expect(useFeedSettingsStore.getState().feeds.following.sort).toBe('latest');
  });
});
