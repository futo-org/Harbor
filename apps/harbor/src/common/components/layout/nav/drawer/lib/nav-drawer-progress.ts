import { makeMutable } from 'react-native-reanimated';

/** 0 closed, 1 open. */
export const navDrawerProgress = makeMutable(0);

/** Critically damped spring for settling the drawer without overshoot. */
export const DRAWER_SPRING = {
  mass: 1,
  stiffness: 400,
  damping: 40,
  overshootClamping: true,
} as const;
