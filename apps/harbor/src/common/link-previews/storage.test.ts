import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettings } from '@/src/common/settings';

const SETTINGS_KEY = 'polycentric:settings';

beforeEach(async () => {
  await AsyncStorage.clear();
  useSettings.setState({ linkPreviewsEnabled: true });
  jest.clearAllMocks();
});

describe('settings store — linkPreviewsEnabled', () => {
  it('defaults to true', () => {
    expect(useSettings.getState().linkPreviewsEnabled).toBe(true);
  });

  it('round-trips true and false', () => {
    useSettings.getState().setLinkPreviewsEnabled(false);
    expect(useSettings.getState().linkPreviewsEnabled).toBe(false);

    useSettings.getState().setLinkPreviewsEnabled(true);
    expect(useSettings.getState().linkPreviewsEnabled).toBe(true);
  });

  it('persists via the settings key', async () => {
    useSettings.getState().setLinkPreviewsEnabled(false);

    // The persist middleware calls AsyncStorage.setItem during setState.
    // Flush pending microtasks so the mock's async setItem resolves.
    await new Promise((resolve) => setImmediate(resolve));

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      SETTINGS_KEY,
      expect.stringContaining('"linkPreviewsEnabled":false'),
    );
  });

  it('recovers from a malformed stored value', async () => {
    await AsyncStorage.setItem(SETTINGS_KEY, '{broken');
    const { persist } = useSettings;
    await persist.rehydrate();
    // Should fall back to the default
    expect(useSettings.getState().linkPreviewsEnabled).toBe(true);
  });

  it('returns the default instead of throwing when storage errors', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
      new Error('boom'),
    );
    const { persist } = useSettings;
    await persist.rehydrate();
    expect(useSettings.getState().linkPreviewsEnabled).toBe(true);
  });
});
