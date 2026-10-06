import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { create } from 'zustand';

export const ALL_CATEGORIES = 'All';

const SEARCH_DEBOUNCE_MS = 150;

export const useEmojiPickerStore = create<{
  /**
   * A post snapshot from opening: rely only on its fixed fields, not e.g., counts.
   * Kept after closing so the native dismiss animation has content.
   */
  post: PostData | null;
  open: boolean;
  /** The text as typed; drives the input's clear button. */
  rawQuery: string;
  /** Debounced `rawQuery`; drives the grid. */
  query: string;
  selectedCategory: string;
  openFor: (post: PostData) => void;
  close: () => void;
  setRawQuery: (rawQuery: string) => void;
  clearQuery: () => void;
  /** Tapping the selected category again goes back to the unfiltered grid. */
  toggleCategory: (key: string) => void;
}>((set, get) => {
  let debounceTimeout: ReturnType<typeof setTimeout> | undefined;
  const clearQuery = () => {
    clearTimeout(debounceTimeout);
    set({ rawQuery: '', query: '' });
  };
  return {
    post: null,
    open: false,
    rawQuery: '',
    query: '',
    selectedCategory: ALL_CATEGORIES,
    openFor: (post) => {
      clearQuery();
      set({ post, open: true, selectedCategory: ALL_CATEGORIES });
    },
    close: () => set({ open: false }),
    setRawQuery: (rawQuery) => {
      clearTimeout(debounceTimeout);
      if (rawQuery === '') {
        // Empty query resets the search immediately
        set({ rawQuery, query: '' });
      } else {
        set({ rawQuery });
        debounceTimeout = setTimeout(
          () => set({ query: rawQuery }),
          SEARCH_DEBOUNCE_MS,
        );
      }
    },
    clearQuery,
    toggleCategory: (key) =>
      set({
        selectedCategory: get().selectedCategory === key ? ALL_CATEGORIES : key,
      }),
  };
});
