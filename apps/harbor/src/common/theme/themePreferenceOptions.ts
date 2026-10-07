import type { IconName } from '@/src/common/components/Icon';
import type { ThemePreference } from './themes';

export const THEME_PREFERENCE_OPTIONS: {
  preference: ThemePreference;
  label: string;
  icon: IconName;
}[] = [
  { preference: 'system', label: 'System', icon: 'contrast' },
  { preference: 'light', label: 'Light', icon: 'themeLight' },
  { preference: 'dark', label: 'Dark', icon: 'themeDark' },
];
