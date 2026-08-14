import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Manifest at `apk/<channel>/latest.json`, published by
 *  .gitlab/ci/scripts/publish-android-update.mjs. */
export interface UpdateInfo {
  package: string;
  channel: string;
  versionName: string;
  versionCode: number;
  url: string;
  sha256: string;
  notes: string;
  publishedAt: string;
}

export type UpdatePhase = 'idle' | 'downloading' | 'installing' | 'error';

interface UpdateStore {
  /** Auto checks won't re-offer this versionCode. */
  skippedVersionCode: number | null;
  lastCheckedAt: number | null;

  // Not persisted (see partialize below).
  available: UpdateInfo | null;
  sheetOpen: boolean;
  phase: UpdatePhase;
  /** 0..1, or null while the total size is unknown. */
  progress: number | null;
  error: string | null;

  setAvailable: (info: UpdateInfo) => void;
  closeSheet: () => void;
  skipAvailableVersion: () => void;
  markChecked: () => void;
  setDownloading: (progress: number | null) => void;
  setInstalling: () => void;
  setError: (message: string) => void;
  resetPhase: () => void;
}

export const useUpdateStore = create<UpdateStore>()(
  persist(
    (set, get) => ({
      skippedVersionCode: null,
      lastCheckedAt: null,

      available: null,
      sheetOpen: false,
      phase: 'idle',
      progress: null,
      error: null,

      setAvailable: (info) =>
        set({
          available: info,
          sheetOpen: true,
          phase: 'idle',
          progress: null,
          error: null,
        }),
      closeSheet: () => set({ sheetOpen: false }),
      skipAvailableVersion: () => {
        const version = get().available?.versionCode;
        if (version != null)
          set({ skippedVersionCode: version, sheetOpen: false });
      },
      markChecked: () => set({ lastCheckedAt: Date.now() }),
      setDownloading: (progress) =>
        set({ phase: 'downloading', progress, error: null }),
      setInstalling: () => set({ phase: 'installing', progress: null }),
      setError: (message) => set({ phase: 'error', error: message }),
      resetPhase: () => set({ phase: 'idle', progress: null, error: null }),
    }),
    {
      name: 'polycentric:apk-update',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        skippedVersionCode: state.skippedVersionCode,
        lastCheckedAt: state.lastCheckedAt,
      }),
    },
  ),
);
