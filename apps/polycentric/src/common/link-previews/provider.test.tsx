import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { LinkPreviewsProvider, useLinkPreviews } from './';

const KEY = 'polycentric:generate-link-previews-enabled';

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

/** Flush the load effect's pending microtasks. */
const flush = () => act(async () => {});

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('LinkPreviewsProvider', () => {
  it('defaults to enabled when nothing is stored', async () => {
    const { result } = renderHook();
    await flush();
    expect(result.current.enabled).toBe(true);
  });

  it('hydrates the stored value', async () => {
    await AsyncStorage.setItem(KEY, 'false');
    const { result } = renderHook();
    await flush();
    expect(result.current.enabled).toBe(false);
  });

  it('updates and persists when toggled', async () => {
    const { result } = renderHook();
    await flush();

    act(() => result.current.setEnabled(false));
    expect(result.current.enabled).toBe(false);

    await flush();
    expect(await AsyncStorage.getItem(KEY)).toBe('false');
  });
});
