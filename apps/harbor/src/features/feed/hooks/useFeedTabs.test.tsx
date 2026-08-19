import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { useFeedSettingsStore } from './useFeedSettingsStore';
import { useFeedTabs } from './useFeedTabs';

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

describe('useFeedTabs page control', () => {
  /** Stands in for the showing page registering itself. */
  function registerPage(tabs: Awaited<ReturnType<typeof renderTabs>>) {
    const page = { scrollToTop: jest.fn(), refresh: jest.fn() };
    tabs.current.control.current = page;
    return page;
  }

  it('leaves the page alone when another tab is selected', async () => {
    await useFeedSettingsStore.persist.rehydrate();
    const tabs = await renderTabs();
    const page = registerPage(tabs);

    act(() => {
      tabs.current.onTabPress('for-you');
    });

    expect(useFeedSettingsStore.getState().feeds.following.tab).toBe('for-you');
    expect(page.refresh).not.toHaveBeenCalled();
    expect(page.scrollToTop).not.toHaveBeenCalled();
  });

  it('scrolls to the top and refreshes when the active tab is re-tapped', async () => {
    await useFeedSettingsStore.persist.rehydrate();
    const tabs = await renderTabs();
    const page = registerPage(tabs);

    act(() => {
      tabs.current.onTabPress('latest');
    });

    expect(page.scrollToTop).toHaveBeenCalled();
    expect(page.refresh).toHaveBeenCalled();
    expect(useFeedSettingsStore.getState().feeds.following.tab).toBe('latest');
  });

  it('refreshes the registered page', async () => {
    await useFeedSettingsStore.persist.rehydrate();
    const tabs = await renderTabs();
    const page = registerPage(tabs);

    act(() => {
      tabs.current.refreshActive();
    });

    expect(page.scrollToTop).toHaveBeenCalled();
    expect(page.refresh).toHaveBeenCalled();
  });

  it('does nothing when no page has registered', async () => {
    const tabs = await renderTabs();

    expect(() => tabs.current.refreshActive()).not.toThrow();
  });
});
