import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { useSettings } from '@/src/common/settings';
import { useFeatureFlag } from '../';

const SETTINGS_KEY = 'polycentric:settings';

const renderers: TestRenderer.ReactTestRenderer[] = [];

function renderFlag() {
  const result = { current: null as boolean | null };
  function Probe() {
    result.current = useFeatureFlag('anywhere');
    return null;
  }
  act(() => {
    renderers.push(TestRenderer.create(<Probe />));
  });
  return result;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  act(() => {
    useSettings.setState({ featureFlags: {} });
  });
});

afterEach(() => {
  act(() => {
    for (const renderer of renderers.splice(0)) renderer.unmount();
  });
});

describe('useFeatureFlag', () => {
  it('is the default until switched', async () => {
    await useSettings.persist.rehydrate();

    expect(renderFlag().current).toBe(false);
  });

  it('follows the switch and persists it', async () => {
    await useSettings.persist.rehydrate();
    const result = renderFlag();

    // The action returns the write's promise, which `act` must not be given.
    act(() => {
      useSettings.getState().setFeatureFlag('anywhere', true);
    });
    expect(result.current).toBe(true);

    const stored = JSON.parse(
      (await AsyncStorage.getItem(SETTINGS_KEY)) ?? '{}',
    );
    expect(stored.state.featureFlags).toEqual({ anywhere: true });
  });

  it('reads what was stored', async () => {
    await AsyncStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        state: { featureFlags: { anywhere: true } },
        version: 1,
      }),
    );
    await useSettings.persist.rehydrate();

    expect(renderFlag().current).toBe(true);
  });

  it('keeps the defaults of settings stored before there were flags', async () => {
    await AsyncStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ state: { theme: 'dark' }, version: 1 }),
    );
    await useSettings.persist.rehydrate();

    expect(useSettings.getState().featureFlags).toEqual({});
    expect(renderFlag().current).toBe(false);
  });
});
