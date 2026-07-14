import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { useSettings } from '@/src/common/settings';
import { LinkPreviewsProvider, useLinkPreviews } from './';

const SETTINGS_KEY = 'polycentric:settings';

type Api = ReturnType<typeof useLinkPreviews>;

/** Render the hook under the provider; `result.current` tracks the latest value. */
function renderHook() {
  const result: { current: Api } = { current: null as never };
  function Probe() {
    result.current = useLinkPreviews();
    return null;
  }
  act(() => {
    TestRenderer.create(
      <LinkPreviewsProvider>
        <Probe />
      </LinkPreviewsProvider>,
    );
  });
  return { result };
}

/** Flush pending microtasks (hydration, state updates). */
const flush = () => act(async () => {});

beforeEach(async () => {
  await AsyncStorage.clear();
  useSettings.setState({ linkPreviewsEnabled: true });
});

describe('LinkPreviewsProvider', () => {
  it('defaults to enabled when nothing is stored', async () => {
    await useSettings.persist.rehydrate();
    const { result } = renderHook();
    await flush();
    expect(result.current.enabled).toBe(true);
  });

  it('hydrates the stored value', async () => {
    await AsyncStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ state: { linkPreviewsEnabled: false } }),
    );
    await useSettings.persist.rehydrate();

    const { result } = renderHook();
    await flush();
    expect(result.current.enabled).toBe(false);
  });

  it('updates and persists when toggled', async () => {
    await useSettings.persist.rehydrate();

    const { result } = renderHook();
    await flush();

    act(() => result.current.setEnabled(false));
    expect(result.current.enabled).toBe(false);

    await useSettings.persist.rehydrate();

    const stored = await AsyncStorage.getItem(SETTINGS_KEY);
    const parsed = stored ? JSON.parse(stored) : {};
    expect(parsed.state.linkPreviewsEnabled).toBe(false);
  });
});
