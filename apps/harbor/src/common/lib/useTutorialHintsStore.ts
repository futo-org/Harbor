import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type TutorialHint = 'kbSubmitPost' | 'kbMentionNavigate' | 'kbMentionInsert';

type TutorialHintsStore = {
  dismissedHints: Partial<Record<TutorialHint, true>>;
  dismissHint: (hint: TutorialHint) => void;
};

/**
 * Which tutorial hints the user no longer needs. Remembered across restarts.
 */
export const useTutorialHintsStore = create<TutorialHintsStore>()(
  persist(
    (set) => ({
      dismissedHints: {},

      dismissHint: (hint) =>
        set((state) => ({
          dismissedHints: { ...state.dismissedHints, [hint]: true },
        })),
    }),
    {
      name: 'polycentric:tutorial-hints',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export function useIsTutorialHintShown(hint: TutorialHint): boolean {
  const hydrated = useSyncExternalStore(
    useTutorialHintsStore.persist.onFinishHydration,
    useTutorialHintsStore.persist.hasHydrated,
    // The server render has no stored state
    () => false,
  );
  const dismissed = useTutorialHintsStore(
    (state) => !!state.dismissedHints[hint],
  );
  return hydrated && !dismissed;
}
