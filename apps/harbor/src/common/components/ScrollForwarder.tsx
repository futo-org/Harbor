import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { useAnimatedScrollHandler } from 'react-native-reanimated';

/** A scrollable's handle for whoever coordinates it. */
export type ForwardedScrollable = {
  scrollToOffset: (offset: number) => void;
  getScrollOffset: () => number;
};

type Forwarding = {
  /** Receives scroll events; omitted for scrollables that must not drive
   *  the header. */
  onScroll?: ReturnType<typeof useAnimatedScrollHandler>;
  /** Room a floating header needs above the content. */
  contentPaddingTop: number;
  /** Where the scrollable registers itself for offset syncing. */
  register?: (scrollable: ForwardedScrollable | null) => void;
};

const ScrollForwarderContext = createContext<Forwarding | null>(null);

/**
 * Junction between a screen that owns one header over several scrollables
 * (a pager's pages) and the scrollable below it: scroll events go up, layout
 * room comes down.
 */
export function ScrollForwarder({
  onScroll,
  contentPaddingTop,
  register,
  children,
}: Forwarding & { children: ReactNode }) {
  const value = useMemo(
    () => ({ onScroll, contentPaddingTop, register }),
    [onScroll, contentPaddingTop, register],
  );
  return (
    <ScrollForwarderContext.Provider value={value}>
      {children}
    </ScrollForwarderContext.Provider>
  );
}

/** The forwarding provided by an enclosing `ScrollForwarder`, if any. */
export function useForwardedScroll() {
  return useContext(ScrollForwarderContext);
}
