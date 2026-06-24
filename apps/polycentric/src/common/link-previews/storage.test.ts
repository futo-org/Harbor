import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadLinkPreviewsEnabled, saveLinkPreviewsEnabled } from './storage';

const KEY = 'polycentric:generate-link-previews-enabled';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('link-previews storage', () => {
  it('returns undefined when nothing is stored', async () => {
    expect(await loadLinkPreviewsEnabled()).toBeUndefined();
  });

  it('round-trips true and false', async () => {
    await saveLinkPreviewsEnabled(true);
    expect(await loadLinkPreviewsEnabled()).toBe(true);

    await saveLinkPreviewsEnabled(false);
    expect(await loadLinkPreviewsEnabled()).toBe(false);
  });

  it('persists as a string under the documented key', async () => {
    await saveLinkPreviewsEnabled(false);
    expect(await AsyncStorage.getItem(KEY)).toBe('false');
  });

  it('ignores a malformed stored value', async () => {
    await AsyncStorage.setItem(KEY, 'maybe');
    expect(await loadLinkPreviewsEnabled()).toBeUndefined();
  });

  it('returns undefined instead of throwing when storage errors', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
      new Error('boom'),
    );
    expect(await loadLinkPreviewsEnabled()).toBeUndefined();
  });
});
