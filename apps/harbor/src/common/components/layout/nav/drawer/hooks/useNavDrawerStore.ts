import { create } from 'zustand';

type NavDrawerState = {
  open: boolean;
  /** The focused screen's pager and the page it is on. */
  pager: { id: string; page: number } | null;
  claimPager: (id: string, page: number) => void;
  setPagerPage: (id: string, page: number) => void;
  releasePager: (id: string) => void;
  show: () => void;
  hide: () => void;
};

export const useNavDrawerStore = create<NavDrawerState>((set) => ({
  open: false,
  pager: null,
  claimPager: (id, page) => set({ pager: { id, page } }),
  setPagerPage: (id, page) =>
    set((s) => (s.pager?.id === id ? { pager: { id, page } } : s)),
  releasePager: (id) => set((s) => (s.pager?.id === id ? { pager: null } : s)),
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
