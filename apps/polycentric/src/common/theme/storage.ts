import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ThemeKey } from './themes';

const STORAGE_KEY = 'polycentric:theme-name';

export async function loadThemeName(): Promise<ThemeKey | undefined> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export async function saveThemeName(themeName: ThemeKey): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, themeName);
  } catch {
    return;
  }
}
