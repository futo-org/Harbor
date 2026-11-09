import type { SharePayload } from 'expo-sharing';
import { create } from 'zustand';

// Temporary: feeds the share debug page until shares go to the composer.

export type ShareDebugInfo = {
  source: 'native share' | 'web link';
  // Whether the share launched the app or reached it running in the background
  launch: 'cold' | 'warm' | null;
  receivedAt: number;
  rawPayloads: SharePayload[];
  failedImages: { sourceUri: string; error: string }[];
};

type ShareDebugState = {
  shareDebugInfo: ShareDebugInfo | null;
  setShareDebugInfo: (shareDebugInfo: ShareDebugInfo) => void;
  clearShareDebugInfo: () => void;
};

export const useShareDebugStore = create<ShareDebugState>((set) => ({
  shareDebugInfo: null,
  setShareDebugInfo: (shareDebugInfo) => set({ shareDebugInfo }),
  clearShareDebugInfo: () => set({ shareDebugInfo: null }),
}));
