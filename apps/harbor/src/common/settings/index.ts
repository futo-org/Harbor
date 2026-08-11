import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ModerationLevel = 'hide' | 'warn' | 'show';

export const MODERATION_LABELS = [
  'hate',
  'self-harm',
  'sexually-suggestive',
  'sexually-explicit',
  'violence',
] as const;

export type ModerationLabel = (typeof MODERATION_LABELS)[number];

export type ModerationPreferences = Record<ModerationLabel, ModerationLevel>;

export type ModerationLabelEntry = {
  key: ModerationLabel;
  name: string;
  description: string;
};

export const MODERATION_LABEL_ENTRIES: ModerationLabelEntry[] = [
  {
    key: 'hate',
    name: 'Hate',
    description: 'Hate speech or incitement against groups',
  },
  {
    key: 'self-harm',
    name: 'Self-Harm',
    description: 'Self-harm, eating disorders, suicide',
  },
  {
    key: 'sexually-suggestive',
    name: 'Sexually Suggestive',
    description: 'Innuendo or implied sexual acts',
  },
  {
    key: 'sexually-explicit',
    name: 'Sexually Explicit',
    description: 'Pornography or explicit sexual acts',
  },
  {
    key: 'violence',
    name: 'Violence',
    description: 'Violent acts, gore, injury, or terrorism',
  },
];

export function moderationLabelName(label: string): string {
  return MODERATION_LABEL_ENTRIES.find((e) => e.key === label)?.name ?? label;
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
