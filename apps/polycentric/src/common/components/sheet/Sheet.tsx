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
  StyleSheet,
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

type CommonProps = {
  children: ReactNode;
  detents?: SheetDetent[];
  dismissible?: boolean;
  /** Dim the background; tapping the dim area dismisses the sheet (native).
   * Set to `false` to allow interacting with the screen behind instead. */
  dimmed?: boolean;
  scrollable?: boolean;
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
  const [rendered, setRendered] = useState(props.open !== false);
  useEffect(() => {
    if (props.open !== false) setRendered(true);
  }, [props.open]);

  if (isWeb ? props.open === false : !rendered) return null;
  return (
    <Portal name={`sheet-${portalId}`}>
      {isWeb ? (
        <WebModal {...props} navigation={navigation} />
      ) : (
        <NativeSheet
          {...props}
          navigation={navigation}
          onDismissed={() => setRendered(false)}
        />
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
type NativeInternalProps = WithNavigation<SheetProps> & {
  /** Fired once the native dismiss animation has finished. */
  onDismissed?: () => void;
};
type WebInternalProps = WithNavigation<SheetProps>;

function NativeSheet({
  open,
  onClose,
  onDismissed,
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
  /** Suppress `onClose` for the next `onDidDismiss` — set when we're
   * tearing down because of an external `open=false` transition. */
  const suppressOnCloseRef = useRef(false);

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

  // Inline mode: external `open=false` triggers a silent dismiss
  // animation (no `onClose` callback — the caller already knows).
  useEffect(() => {
    if (!isInline) return;
    if (open) return;
    suppressOnCloseRef.current = true;
    void sheetRef.current?.dismiss().catch(() => {});
  }, [isInline, open]);

  const surface = theme.palette.neutral_0;

  return (
    <TrueSheet
      ref={sheetRef}
      dimmed={dimmed}
      backgroundColor={surface}
      detents={detents}
      initialDetentIndex={0}
      dismissible={dismissible}
      scrollable={scrollable}
      onDidPresent={() => props.onPresented?.()}
      onDidDismiss={() => {
        if (suppressOnCloseRef.current) {
          suppressOnCloseRef.current = false;
          onDismissed?.();
          return;
        }
        if (isInline) {
          onClose?.();
          onDismissed?.();
          return;
        }
        if (animatedDismissRef.current) return;
        animatedDismissRef.current = true;
        if (navigation.canGoBack()) navigation.goBack();
      }}
      header={props.header}
      footer={props.footer}
    >
      <View style={[styles.sheetBody, { backgroundColor: surface }]}>
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
      style={[styles.webOverlay, animatedStyle]}
      pointerEvents="box-none"
    >
      <Pressable
        accessibilityLabel="Dismiss"
        style={styles.webBackdrop}
        onPress={dismissible ? close : undefined}
      />
      <View
        style={[
          styles.webCard,
          compact && styles.webCardCompact,
          {
            backgroundColor: theme.palette.neutral_0,
            borderRadius: compact ? 0 : BorderRadius.xl,
          },
        ]}
      >
        {header}
        {children}
        {footer}
      </View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  sheetBody: {
    width: '100%',
    flex: 1,
  },
  webOverlay: {
    // RN-Web honors `position: 'fixed'`; this branch is web-only at render time.
    position: 'fixed' as 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // The overlay itself scrolls so the whole modal (card + content) grows
    // and scrolls as one. The card is centered via `margin: auto` rather than
    // `justifyContent` — auto margins collapse to 0 when the card is taller
    // than the viewport, so the top never gets clipped out of reach.
    overflowY: 'auto' as 'scroll',
    padding: 16,
    // Sit above expo-router's transparentModal drawer, which mounts to
    // document.body via vaul and would otherwise eat backdrop clicks.
    zIndex: ZIndex.modal,
  },
  webBackdrop: {
    // Fixed so it keeps covering the viewport while the overlay scrolls.
    position: 'fixed' as 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  webCard: {
    width: '100%',
    maxWidth: 600,
    marginVertical: 'auto',
    marginHorizontal: 'auto',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  webCardCompact: {
    maxWidth: '100%',
    marginVertical: 0,
    minHeight: '100%',
  },
});
