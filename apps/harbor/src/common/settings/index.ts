import {
  moderationLabels,
  moderationLabelEntries,
  isModerationLabel,
} from '@polycentric/react-native';
import type { ModerationLabelEntry } from '@polycentric/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type { ModerationLabelEntry };

export const MODERATION_LABELS: readonly string[] = moderationLabels();

export type ModerationLabel = (typeof MODERATION_LABELS)[number];

export function moderationLabelFromValue(
  value: string,
): ModerationLabel | undefined {
  return isModerationLabel(value) ? (value as ModerationLabel) : undefined;
}

export const MODERATION_LABEL_ENTRIES: ModerationLabelEntry[] =
  moderationLabelEntries();

export function moderationLabelName(label: string): string {
  return MODERATION_LABEL_ENTRIES.find((e) => e.key === label)?.name ?? label;
}

export type ModerationLevel = 'hide' | 'warn' | 'show';

export type ModerationPreferences = Record<ModerationLabel, ModerationLevel>;

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
