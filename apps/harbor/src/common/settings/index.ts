import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ThemePreference } from '@/src/common/theme/themes';
import type { ModerationLabel } from './moderationLabels';

export type {
  ModerationLabel,
  ModerationLabelEntry,
} from './moderationLabels';

export type ModerationLevel = 'hide' | 'warn' | 'show';

export type ModerationPreferences = Partial<
  Record<ModerationLabel, ModerationLevel>
>;

export interface SettingsState {
  theme: ThemePreference;
  linkPreviewsEnabled: boolean;
  moderation: ModerationPreferences;
}

export interface SettingsActions {
  setTheme: (theme: ThemePreference) => void;
  setLinkPreviewsEnabled: (enabled: boolean) => void;
  setModeration: (prefs: Partial<ModerationPreferences>) => void;
}

export type SettingsStore = SettingsState & SettingsActions;

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: 'system',
      linkPreviewsEnabled: true,
      moderation: {
        hate: 'warn',
        'self-harm': 'warn',
        'sexually-suggestive': 'warn',
        'sexually-explicit': 'warn',
        violence: 'warn',
      },

      setTheme: (theme) => set({ theme }),
      setLinkPreviewsEnabled: (enabled) =>
        set({ linkPreviewsEnabled: enabled }),
      setModeration: (prefs) =>
        set((state) => ({
          moderation: { ...state.moderation, ...prefs },
        })),
    }),
    {
      name: 'polycentric:settings',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
