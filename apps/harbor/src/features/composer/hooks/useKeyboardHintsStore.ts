import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type KeyboardShortcut = 'submitPost' | 'mentionNavigate' | 'mentionInsert';

type KeyboardHintsStore = {
  usedShortcuts: Partial<Record<KeyboardShortcut, true>>;
  markShortcutUsed: (shortcut: KeyboardShortcut) => void;
};

/**
 * Which keyboard shortcuts the user has already used, remembered across
 * restarts. Each shortcut's hint is shown until then.
 */
export const useKeyboardHintsStore = create<KeyboardHintsStore>()(
  persist(
    (set) => ({
      usedShortcuts: {},

      markShortcutUsed: (shortcut) =>
        set((state) => ({
          usedShortcuts: { ...state.usedShortcuts, [shortcut]: true },
        })),
    }),
    {
      name: 'polycentric:keyboard-hints',
      // Synchronous, so the store is hydrated as soon as it's created. Native
      // and the server render have no localStorage and skip persistence, but
      // the keyboard hints are a web-only feature anyway.
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
