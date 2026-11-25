import { createContext } from 'react';
import type { PanGesture } from 'react-native-gesture-handler';

/** The drawer's drag, for native scrollers that should wait for it. */
export const NavDrawerGestureContext = createContext<PanGesture | undefined>(
  undefined,
);
