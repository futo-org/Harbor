import { usePanGesture } from 'react-native-gesture-handler';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { navDrawerProgress } from '../lib/nav-drawer-progress';
import { useNavDrawerStore } from './useNavDrawerStore';
import { useNavDrawerWidth } from './useNavDrawerWidth';

const FLING_VELOCITY = 500;

type NavDrawerPanOptions = {
  enabled: boolean;
  /** Only drags starting this close to the left edge count. */
  edgeWidth?: number;
};

/** Drags the drawer open (rightward, while closed) or shut. */
export function useNavDrawerPan({ enabled, edgeWidth }: NavDrawerPanOptions) {
  const width = useNavDrawerWidth();
  const open = useNavDrawerStore((s) => s.open);
  const show = useNavDrawerStore((s) => s.show);
  const hide = useNavDrawerStore((s) => s.hide);
  const start = useSharedValue(0);

  return usePanGesture({
    enabled,
    hitSlop: edgeWidth ? { left: 0, width: edgeWidth } : undefined,
    activeOffsetX: open ? [-10, 10] : 6,
    failOffsetX: open ? undefined : -1,
    failOffsetY: open ? [-10, 10] : [-6, 6],
    onActivate: () => {
      start.value = navDrawerProgress.value;
    },
    onUpdate: (e) => {
      const next = start.value + e.translationX / width;
      navDrawerProgress.value = Math.min(1, Math.max(0, next));
    },
    onDeactivate: (e) => {
      const opens =
        e.velocityX > FLING_VELOCITY
          ? true
          : e.velocityX < -FLING_VELOCITY
            ? false
            : navDrawerProgress.value > (open ? 2 / 3 : 1 / 3);
      navDrawerProgress.value = withTiming(opens ? 1 : 0, { duration: 180 });
      runOnJS(opens ? show : hide)();
    },
  });
}
