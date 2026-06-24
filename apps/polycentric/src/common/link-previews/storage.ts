import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'polycentric:generate-link-previews-enabled';

export async function loadLinkPreviewsEnabled(): Promise<boolean | undefined> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'true' || stored === 'false') {
      return stored === 'true';
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export async function saveLinkPreviewsEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    return;
  }
}
