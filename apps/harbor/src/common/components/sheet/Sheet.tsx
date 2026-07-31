import {
  Atoms,
  BorderRadius,
  Breakpoints,
  Spacing,
  useTheme,
  ZIndex,
} from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { TrueSheet, type SheetDetent } from '@lodev09/react-native-true-sheet';
import { Portal } from '@rn-primitives/portal';
import { router, useNavigation } from 'expo-router';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Pressable,
  useWindowDimensions,
  View,
  type ViewProps,
} from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import Icon, { type IconProps } from '../Icon';
import Topbar from '../layout/Topbar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FADE_IN_MS = 150;
const FADE_OUT_MS = 120;

/** Exported for viewport-aware content sizing. */
export const SHEET_OVERLAY_PADDING = 16;

type CommonProps = {
  children: ReactNode;
  detents?: SheetDetent[];
  dismissible?: boolean;
  /** Dim the background; tapping the dim area dismisses the sheet (native).
   * Set to `false` to allow interacting with the screen behind instead. */
  dimmed?: boolean;
  scrollable?: boolean;
  /** Web only: overrides the modal card's default 600px max width. */
  maxWidth?: number;
  header?: ReactElement;
  /** Pinned footer element — bottom of the sheet (native) / card (web). */
  footer?: ReactElement;
  /** Fired once the sheet has finished presenting. */
  onPresented?: () => void;
};

export type SheetProps =
  | (CommonProps & { open?: undefined; onClose?: undefined })
  | (CommonProps & { open: boolean; onClose?: () => void });

export function Sheet(props: SheetProps) {
  const portalId = useId();
  const navigation = useSheetNavigation();
  // Web hides instantly, but Native should stay mounted so that the dismiss
  // animation can play before teardown
  if (isWeb && props.open === false) return null;
  return (
    <Portal name={`sheet-${portalId}`}>
      {isWeb ? (
        <WebModal {...props} navigation={navigation} />
      ) : (
        <NativeSheet {...props} navigation={navigation} />
      )}
    </Portal>
  );
}

type SheetContentProps = ViewProps;
function SheetContent({ children, style, ...props }: SheetContentProps) {
  return (
    <View
      style={[Atoms.p_lg, Atoms.flex_1, { minHeight: 50 }, style]}
      {...props}
    >
      {children}
    </View>
  );
}

export type SheetHeaderProps = {
  title?: string;
  closeIcon?: IconProps['name'];
  onClose: () => void;
  left?: ReactNode;
  right?: ReactNode;
};

function SheetHeader({
  title,
  closeIcon = 'close',
  onClose,
  left,
  right,
}: SheetHeaderProps) {
  // Native sheets dismiss by swiping down, so the close button is redundant
  // there — hide it. Web modals keep it, and back chevrons show everywhere.
  const hideDefault = !isWeb && closeIcon === 'close';
  left =
    left ??
    (hideDefault ? (
      <View style={{ width: 40, height: 40 }} />
    ) : (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onClose}
        hitSlop={Spacing['lg']}
        style={({ pressed }) => [pressed && { opacity: 0.5 }]}
      >
        <Icon name={closeIcon} size={24} color="neutral_900" />
      </Pressable>
    ));
  right = right ?? <View style={{ width: 40, height: 40 }} />;

  return (
    <Topbar
      title={title}
      center={title ? undefined : <></>}
      left={left}
      right={right}
    />
  );
}

type SheetFooterProps = {
  left?: ReactElement;
  right?: ReactElement;
};
export function SheetFooter({ left, right }: SheetFooterProps) {
  const { theme } = useTheme();

  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.p_lg,
        { paddingBottom: insets.bottom + Spacing['lg'] },
        {
          backgroundColor: theme.palette.neutral_0,
        },
      ]}
    >
      <View style={Atoms.flex_1}>{left}</View>
      <View style={Atoms.self_end}>{right}</View>
    </View>
  );
}

Sheet.Header = SheetHeader;
Sheet.Content = SheetContent;
Sheet.Footer = SheetFooter;

// `ReturnType` can't see a generic hook's default type; the non-generic
// wrapper pins it down without importing react-navigation's types.
const useSheetNavigation = () => useNavigation();
type Navigation = ReturnType<typeof useSheetNavigation>;

type WithNavigation<T> = T & {
  navigation: Navigation;
};
type NativeInternalProps = WithNavigation<SheetProps>;
type WebInternalProps = WithNavigation<SheetProps>;

function NativeSheet({
  open,
  onClose,
  children,
  detents = [0.5],
  dismissible = true,
  dimmed = true,
  scrollable = false,
  navigation,
  ...props
}: NativeInternalProps) {
  const { theme } = useTheme();
  const sheetRef = useRef<TrueSheet>(null);
  /** Once the sheet's dismiss animation has run (or is running) we
   * shouldn't loop it again on the follow-up navigation dispatch. */
  const animatedDismissRef = useRef(false);

  const isInline = open !== undefined;

  // Route mode: when the screen is being removed, play TrueSheet's
  // dismiss animation first, then let the navigation action through.
  useEffect(() => {
    if (isInline) return;
    return navigation.addListener('beforeRemove', (e) => {
      if (animatedDismissRef.current) return;
      e.preventDefault();
      animatedDismissRef.current = true;
      void sheetRef.current
        ?.dismiss()
        .catch(() => {})
        .finally(() => navigation.dispatch(e.data.action));
    });
  }, [navigation, isInline]);

  const [mounted, setMounted] = useState(!!open);
  const openRef = useRef(open);
  openRef.current = open;
  // TrueSheet warns when asked to present or dismiss redundantly, so we track state
  const presentedRef = useRef(!!open);

  // Inline mode: drive the native sheet from the `open` prop.
  useEffect(() => {
    if (!isInline) return;
    if (open) {
      // Mounting presents the sheet by itself.
      if (!mounted) {
        presentedRef.current = true;
        setMounted(true);
        return;
      }
      if (presentedRef.current) return;
      // Mounted but down (reopened while dismiss was still running).
      presentedRef.current = true;
      void sheetRef.current?.present().catch(() => {});
      return;
    }
    if (!mounted) return;
    // If marked down, complete tear down
    if (!presentedRef.current) {
      setMounted(false);
      return;
    }
    // Otherwise stay mounted until the dismiss animation finishes.
    presentedRef.current = false;
    void sheetRef.current
      ?.dismiss()
      .catch(() => {})
      .finally(() => {
        if (!openRef.current) setMounted(false);
      });
  }, [isInline, open, mounted]);

  const surface = theme.palette.neutral_0;

  if (isInline && !mounted) return null;

  return (
    <TrueSheet
      ref={sheetRef}
      dimmed={dimmed}
      backgroundColor={surface}
      detents={detents}
      initialDetentIndex={0}
      dismissible={dismissible}
      scrollable={scrollable}
      onDidPresent={() => {
        presentedRef.current = true;
        props.onPresented?.();
      }}
      onDidDismiss={() => {
        presentedRef.current = false;
        if (isInline) {
          // Report only a dismissal the caller doesn't already know about: if
          // `open` is still true this was the user swiping the sheet away.
          if (openRef.current) onClose?.();
          return;
        }
        if (animatedDismissRef.current) return;
        animatedDismissRef.current = true;
        if (navigation.canGoBack()) navigation.goBack();
      }}
      header={props.header}
      footer={props.footer}
    >
      <View style={[Atoms.w_full, Atoms.flex_1, { backgroundColor: surface }]}>
        {children}
      </View>
    </TrueSheet>
  );
}

/**
 * Fade in on mount, and fade out on dismount
 */
function useFadeTransition() {
  const opacity = useSharedValue(0);
  const exitingRef = useRef(false);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: FADE_IN_MS });
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const fadeOut = useCallback(
    (done: () => void) => {
      if (exitingRef.current) return;
      exitingRef.current = true;
      opacity.value = withTiming(0, { duration: FADE_OUT_MS }, (finished) => {
        if (finished) runOnJS(done)();
      });
    },
    [opacity],
  );

  const isExiting = useCallback(() => exitingRef.current, []);

  return { animatedStyle, fadeOut, isExiting };
}

function WebModal({
  open,
  onClose,
  children,
  dismissible = true,
  maxWidth,
  navigation,
  header,
  footer,
  onPresented,
}: WebInternalProps) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < Breakpoints.sm;

  const isInline = open !== undefined;
  const { animatedStyle, fadeOut, isExiting } = useFadeTransition();

  // Mirror native's `onPresented` once the modal has mounted.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fire once on mount
  useEffect(() => {
    onPresented?.();
  }, []);

  const close = useCallback(() => {
    if (isInline) fadeOut(() => onClose?.());
    else if (router.canGoBack()) router.back();
  }, [isInline, onClose, fadeOut]);

  useEffect(() => {
    if (isInline) return;
    return navigation.addListener('beforeRemove', (e) => {
      if (isExiting()) return;
      e.preventDefault();
      fadeOut(() => navigation.dispatch(e.data.action));
    });
  }, [navigation, isInline, fadeOut, isExiting]);

  // Escape to dismiss.
  useEffect(() => {
    if (!dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismissible, close]);

  return (
    <Reanimated.View
      style={[
        Atoms.fixed,
        Atoms.inset_0,
        // Sit above expo-router's transparentModal drawer, which mounts to
        // document.body via vaul and would otherwise eat backdrop clicks.
        { padding: SHEET_OVERLAY_PADDING, zIndex: ZIndex.modal },
        animatedStyle,
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        accessibilityLabel="Dismiss"
        style={[
          Atoms.fixed,
          Atoms.inset_0,
          { backgroundColor: 'rgba(0,0,0,0.45)' },
        ]}
        onPress={dismissible ? close : undefined}
      />
      <View
        style={[
          Atoms.w_full,
          // Content-sized up to the viewport; taller content scrolls inside
          // the card body so the modal itself never exceeds the screen.
          Atoms.max_h_full,
          Atoms.overflow_hidden,
          Atoms.flex_col,
          { maxWidth: 600, marginVertical: 'auto', marginHorizontal: 'auto' },
          compact &&
            ([
              Atoms.max_w_full,
              { marginVertical: 0, minHeight: '100%' },
            ] as const),
          maxWidth !== undefined && { maxWidth },
          {
            backgroundColor: theme.palette.neutral_0,
            borderRadius: BorderRadius.xl,
          },
        ]}
      >
        {header}
        {/* The scroll container between the pinned header and footer. A
            scroll container's automatic minimum size is 0, so it shrinks to
            the space the card has left instead of forcing the card past its
            max height. */}
        <View style={[Atoms.flex_shrink_1, Atoms.overflow_auto]}>
          {children}
        </View>
        {footer}
      </View>
    </Reanimated.View>
  );
}
