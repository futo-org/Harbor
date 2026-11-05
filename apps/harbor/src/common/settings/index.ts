import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ThemePreference } from '@/src/common/theme/themes';
import { IS_STORE_BUILD } from '@/src/common/util/application';
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

const WARN_ALL: ModerationPreferences = {
  hate: 'warn',
  'self-harm': 'warn',
  'sexually-suggestive': 'warn',
  'sexually-explicit': 'warn',
  violence: 'warn',
};

/** What the App Store Content Policy requires of store installs. */
const STORE_POLICY: ModerationPreferences = {
  hate: 'hide',
  'self-harm': 'hide',
  'sexually-suggestive': 'warn',
  'sexually-explicit': 'hide',
  violence: 'hide',
};

/** Warn on everything; store installs follow their content policy. */
export function defaultModeration(
  storeBuild = IS_STORE_BUILD,
): ModerationPreferences {
  return storeBuild ? { ...WARN_ALL, ...STORE_POLICY } : WARN_ALL;
}

/**
 * Settings persisted before version 1 predate the store policy, so store
 * installs get it applied once.
 */
export function migrateSettings(
  persisted: unknown,
  version: number,
  storeBuild = IS_STORE_BUILD,
): SettingsState {
  const state = persisted as SettingsState;
  if (version < 1 && storeBuild) {
    return { ...state, moderation: { ...state.moderation, ...STORE_POLICY } };
  }
  return state;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: 'system',
      linkPreviewsEnabled: true,
      moderation: defaultModeration(),

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
      version: 1,
      migrate: migrateSettings,
    },
  ),
);
