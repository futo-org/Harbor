import { create } from 'zustand';

export type VerificationScreenMode = 'claim' | 'verify';

interface VerificationsStore {
  mode?: VerificationScreenMode;
  setMode: (mode?: VerificationScreenMode) => void;
}

export const useVerificationsStore = create<VerificationsStore>((set) => ({
  mode: undefined,
  setMode(mode) {
    set({ mode });
  },
}));
