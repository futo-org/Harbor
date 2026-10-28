import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface ErrorEntry {
  id: string;
  at: number;
  name: string;
  message: string;
  stack?: string;
  fatal: boolean;
}

export const MAX_QUEUED_ERRORS = 20;
const MAX_STACK_LENGTH = 8000;

interface ErrorQueueStore {
  entries: ErrorEntry[];
  enqueue: (entry: ErrorEntry) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useErrorQueue = create<ErrorQueueStore>()(
  persist(
    (set) => ({
      entries: [],
      enqueue: (entry) =>
        set((state) => ({
          entries: [
            ...state.entries,
            { ...entry, stack: entry.stack?.slice(0, MAX_STACK_LENGTH) },
          ].slice(-MAX_QUEUED_ERRORS),
        })),
      remove: (id) =>
        set((state) => ({
          entries: state.entries.filter((entry) => entry.id !== id),
        })),
      clear: () => set({ entries: [] }),
    }),
    {
      name: 'polycentric:error-queue',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ entries: state.entries }),
    },
  ),
);
