import { create } from 'zustand';

export type PendingShareImage = { uri: string; width: number; height: number };

/** Content shared into the app that the composer hasn't taken yet. */
export type PendingShare = { text: string; images: PendingShareImage[] };

type PendingShareState = {
  pendingShare: PendingShare | null;
  setPendingShare: (pendingShare: PendingShare) => void;
  clearPendingShare: () => void;
};

export const usePendingShareStore = create<PendingShareState>((set) => ({
  pendingShare: null,
  setPendingShare: (pendingShare) => set({ pendingShare }),
  clearPendingShare: () => set({ pendingShare: null }),
}));
