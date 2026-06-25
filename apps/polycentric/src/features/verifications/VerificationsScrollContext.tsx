import { createContext, useContext } from 'react';
import type Animated from 'react-native-reanimated';
import type { AnimatedRef } from 'react-native-reanimated';

// Scrolls the given section to the top of the screen's scroll viewport.
export type ScrollIntoView = (target: AnimatedRef<Animated.View>) => void;

const Context = createContext<ScrollIntoView | null>(null);

export const VerificationsScrollProvider = Context.Provider;

export function useScrollIntoView() {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error('useScrollIntoView must be used within its provider');
  }
  return ctx;
}
