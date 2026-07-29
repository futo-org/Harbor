import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ModerationLevel = 'hide' | 'warn' | 'show';

export interface ModerationPreferences {
  hate: ModerationLevel;
  selfHarm: ModerationLevel;
  sexual: ModerationLevel;
  porn: ModerationLevel;
  graphicMedia: ModerationLevel;
}

export interface SettingsState {
  theme: 'light' | 'dark';
  linkPreviewsEnabled: boolean;
  moderation: ModerationPreferences;
}

export interface SettingsActions {
  setTheme: (theme: 'light' | 'dark') => void;
  setLinkPreviewsEnabled: (enabled: boolean) => void;
  setModeration: (prefs: Partial<ModerationPreferences>) => void;
}

export type SettingsStore = SettingsState & SettingsActions;

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: 'light',
      linkPreviewsEnabled: true,
      moderation: {
        hate: 'warn',
        selfHarm: 'warn',
        sexual: 'warn',
        porn: 'warn',
        graphicMedia: 'warn',
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
