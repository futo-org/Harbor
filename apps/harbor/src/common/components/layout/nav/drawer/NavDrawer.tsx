import { useIsTabRoot } from '@/src/common/lib/navigation/useIsTabRoot';
import { Atoms, useTheme } from '@/src/common/theme';
import { isIOS } from '@/src/common/util/platform';
import { usePathname } from 'expo-router';
import { type ReactNode, useEffect } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { NavDrawerContent } from './NavDrawerContent';
import { useNavDrawerPan } from './hooks/useNavDrawerPan';
import { useNavDrawerStore } from './hooks/useNavDrawerStore';
import { useNavDrawerWidth } from './hooks/useNavDrawerWidth';
import { NavDrawerGestureContext } from './lib/nav-drawer-gesture-context';
import { DRAWER_SPRING, navDrawerProgress } from './lib/nav-drawer-progress';

const EDGE_WIDTH = 30;
const SCREEN_SHADOW = '0 0 24px rgba(0, 0, 0, 0.25)';
const SCREEN_RADIUS = isIOS ? 48 : 28;

/** Wraps the root stack on native and slides it aside for the drawer;
    opened by the topbar avatar or a drag to the right on a tab root. */
export function NavDrawer({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const width = useNavDrawerWidth();

  const open = useNavDrawerStore((s) => s.open);
  const hide = useNavDrawerStore((s) => s.hide);
  const pagerOffFirstPage = useNavDrawerStore((s) => (s.pager?.page ?? 0) > 0);
  const pathname = usePathname();
  const isTabRoot = useIsTabRoot();

  // biome-ignore lint/correctness/useExhaustiveDependencies: closes the drawer on every route change
  useEffect(() => {
    hide();
  }, [pathname, hide]);

  useEffect(() => {
    navDrawerProgress.value = withSpring(open ? 1 : 0, DRAWER_SPRING);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      hide();
      return true;
    });
    return () => sub.remove();
  }, [open, hide]);

  const pan = useNavDrawerPan({
    enabled: open || isTabRoot,
    edgeWidth: !open && pagerOffFirstPage ? EDGE_WIDTH : undefined,
  });

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: navDrawerProgress.value * width }],
  }));
  const radiusStyle = useAnimatedStyle(() => ({
    borderRadius: Math.min(1, navDrawerProgress.value * 4) * SCREEN_RADIUS,
  }));
  const edgeStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, navDrawerProgress.value * 4) * 0.6,
  }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (navDrawerProgress.value - 1) * width }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: navDrawerProgress.value * 0.5,
  }));

  return (
    <GestureDetector gesture={pan}>
      <View
        collapsable={false}
        style={[Atoms.flex_1, theme.atoms.box.primary.bg]}
      >
        <Animated.View
          testID="nav-drawer"
          pointerEvents={open ? 'auto' : 'none'}
          accessibilityElementsHidden={!open}
          accessibilityViewIsModal={open}
          onAccessibilityEscape={hide}
          importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
          style={[
            Atoms.absolute,
            { top: 0, bottom: 0, left: 0, width },
            theme.atoms.box.primary.bg,
            panelStyle,
          ]}
        >
          <NavDrawerContent />
        </Animated.View>
        <Animated.View
          importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}
          style={[
            Atoms.flex_1,
            { borderCurve: 'continuous', boxShadow: SCREEN_SHADOW },
            theme.atoms.box.primary.bg,
            contentStyle,
            radiusStyle,
          ]}
        >
          <Animated.View
            style={[
              Atoms.flex_1,
              Atoms.overflow_hidden,
              { borderCurve: 'continuous' },
              radiusStyle,
            ]}
          >
            <NavDrawerGestureContext value={pan}>
              {children}
            </NavDrawerGestureContext>
            <Animated.View
              pointerEvents={open ? 'auto' : 'none'}
              style={[
                StyleSheet.absoluteFill,
                theme.atoms.box.primary.bg,
                backdropStyle,
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close menu"
                onPress={hide}
                style={Atoms.flex_1}
              />
            </Animated.View>
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                borderCurve: 'continuous',
                borderWidth: StyleSheet.hairlineWidth,
              },
              theme.atoms.outline,
              radiusStyle,
              edgeStyle,
            ]}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
