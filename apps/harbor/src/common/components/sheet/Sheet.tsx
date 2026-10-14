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
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewProps,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Icon, { type IconProps } from '../Icon';
import Topbar from '../layout/Topbar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FADE_IN_MS = 150;
const FADE_OUT_MS = 120;

/** Exported for viewport-aware content sizing. */
export const SHEET_OVERLAY_PADDING = 16;

// True when a native sheet sizes itself to its content (`'auto'` detent).
// `flex: 1` content has no height of its own, so it'd measure as zero there.
const SheetSizesToContentContext = createContext(false);

type CommonProps = {
  children: ReactNode;
  /** With `'auto'`, the content is measured at its natural height, so it
   * won't stretch to fill a taller detent in the same list. */
  detents?: SheetDetent[];
  dismissible?: boolean;
  /** Dim the background; tapping the dim area dismisses the sheet (native).
   * Set to `false` to allow interacting with the screen behind instead. */
  dimmed?: boolean;
  /** Pins the first ScrollView in the content so it fits the sheet and
   * insets for the keyboard (native). Defaults to `true`. */
  scrollable?: boolean;
  /** Web only: overrides the modal card's default 600px max width. */
  maxWidth?: number;
  /** Web only: fixed card height instead of content sizing; the viewport
   * still caps it. */
  height?: number;
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
        <WebModal {...props} />
      ) : (
        <NativeSheet {...props} navigation={navigation} />
      )}
    </Portal>
  );
}

type SheetContentProps = Omit<ViewProps, 'onScroll'> & {
  /** Set to `false` when the content brings its own scroll container
   * (list or ScrollView) so TrueSheet pins that one instead. */
  scrollable?: boolean;
};

function SheetContent({
  children,
  style,
  scrollable = true,
  ...props
}: SheetContentProps) {
  const sizesToContent = useContext(SheetSizesToContentContext);
  // Web scrolls in the modal card body already; native needs a ScrollView
  // here for TrueSheet to pin and inset when the keyboard shows.
  if (isWeb || !scrollable) {
    return (
      <View
        style={[
          Atoms.p_lg,
          // Web's card body is the scroller here: grow past it rather than
          // shrink to it, or overflowing children spill past the bottom padding.
          !sizesToContent && (scrollable ? Atoms.flex_grow_1 : Atoms.flex_1),
          { minHeight: 50 },
          style,
        ]}
        {...props}
      >
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      style={!sizesToContent && Atoms.flex_1}
      contentContainerStyle={[Atoms.p_lg, { minHeight: 50 }, style]}
      keyboardShouldPersistTaps="handled"
      alwaysBounceVertical={false}
      {...props}
    >
      {children}
    </ScrollView>
  );
}

export type SheetHeaderProps = {
  title?: string;
  closeIcon?: IconProps['name'];
  onClose: () => void;
  left?: ReactNode;
  right?: ReactNode;
  disabled?: boolean;
};

function SheetHeader({
  title,
  closeIcon = 'close',
  onClose,
  left,
  right,
  disabled,
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
        disabled={disabled}
        style={({ pressed }) => [(disabled || pressed) && { opacity: 0.5 }]}
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
  fadeTop?: boolean;
  onLayout?: ViewProps['onLayout'];
};

export function SheetFooter({
  left,
  right,
  fadeTop,
  onLayout,
}: SheetFooterProps) {
  const { theme } = useTheme();

  const insets = useSafeAreaInsets();
  const backgroundColor = theme.palette.neutral_0;
  const padding = Spacing.lg;

  return (
    <View
      onLayout={onLayout}
      style={[
        Atoms.flex_row,
        { padding, paddingBottom: insets.bottom + padding },
        !fadeTop && { backgroundColor },
        // The web footer sits below the scrolling body instead of over it, so
        // pull it up over the body's bottom padding for the fade to overlap.
        fadeTop && isWeb && { marginTop: -padding },
      ]}
    >
      {fadeTop && (
        <FooterFadeBackground color={backgroundColor} height={padding} />
      )}
      <View style={Atoms.flex_1}>{left}</View>
      <View style={Atoms.self_end}>{right}</View>
    </View>
  );
}

function FooterFadeBackground({
  color,
  height,
}: {
  color: string;
  height: number;
}) {
  // SVG ids need to be document-global on web, so keep them unique per instance.
  const gradientId = `footer-fade-${useId()}`;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient
            id={gradientId}
            // Spans just the given height; below it the last stop stays solid.
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="0"
            y2={height}
          >
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset="1" stopColor={color} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
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

function NativeSheet({
  open,
  onClose,
  children,
  detents = [0.5],
  dismissible = true,
  dimmed = true,
  scrollable = true,
  navigation,
  ...props
}: NativeInternalProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
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
  const sizesToContent = detents.includes('auto');

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
      // Prevents the inset from applying when the keyboard is up (footer rises with it)
      footerOptions={{ keyboardOffset: -insets.bottom }}
    >
      <View
        style={[
          Atoms.w_full,
          !sizesToContent && Atoms.flex_1,
          { backgroundColor: surface },
        ]}
      >
        <SheetSizesToContentContext.Provider value={sizesToContent}>
          {children}
        </SheetSizesToContentContext.Provider>
      </View>
    </TrueSheet>
  );
}

function WebModal({
  open,
  onClose,
  children,
  dismissible = true,
  maxWidth,
  height,
  header,
  footer,
  onPresented,
}: SheetProps) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < Breakpoints.sm;

  const isInline = open !== undefined;

  // Mirror native's `onPresented` once the modal has mounted.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fire once on mount
  useEffect(() => {
    onPresented?.();
  }, []);

  const close = useCallback(() => {
    if (isInline) onClose?.();
    else if (router.canGoBack()) router.back();
  }, [isInline, onClose]);

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
      entering={FadeIn.duration(FADE_IN_MS)}
      exiting={FadeOut.duration(FADE_OUT_MS)}
      style={[
        // Reanimated fades a copy attached to the `offsetParent`, which a
        // fixed element doesn't have, so this is absolute in the root view.
        StyleSheet.absoluteFill,
        // Sit above expo-router's transparentModal drawer, which mounts to
        // document.body via vaul and would otherwise eat backdrop clicks.
        { padding: SHEET_OVERLAY_PADDING, zIndex: ZIndex.modal },
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
          height !== undefined && { height },
          Atoms.overflow_hidden,
          Atoms.flex_col,
          { maxWidth: 600, marginVertical: 'auto', marginHorizontal: 'auto' },
          compact && Atoms.max_w_full,
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
            max height, and grows to fill a fixed-height card. */}
        <View style={[Atoms.flex_1, Atoms.overflow_auto]}>{children}</View>
        {footer}
      </View>
    </Reanimated.View>
  );
}
