import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface SettingsState {
  theme: 'light' | 'dark';
  linkPreviewsEnabled: boolean;
  moderatorMode: boolean;
}

export interface SettingsActions {
  setTheme: (theme: 'light' | 'dark') => void;
  setLinkPreviewsEnabled: (enabled: boolean) => void;
  setModeratorMode: (enabled: boolean) => void;
}

export type SettingsStore = SettingsState & SettingsActions;

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: 'light',
      linkPreviewsEnabled: true,
      moderatorMode: false,

      setTheme: (theme) => set({ theme }),
      setLinkPreviewsEnabled: (enabled) =>
        set({ linkPreviewsEnabled: enabled }),
      setModeratorMode: (enabled) => set({ moderatorMode: enabled }),
    }),
    {
      name: 'polycentric:settings',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
