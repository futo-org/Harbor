import Icon from '@/src/common/components/Icon';
import { useHorizontalWheelScroll } from '@/src/common/lib/useHorizontalWheelScroll';
import { useWebHover } from '@/src/common/lib/useWebHover';
import {
  Atoms,
  BorderRadius,
  Spacing,
  useTheme,
  withHexOpacity,
  ZIndex,
} from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { useId, useRef, useState, type ComponentProps } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { IconButton } from './IconButton';

/** Keeps the chevrons off the very edge of the container. */
const CHEVRON_INSET = Spacing.xs;

/**
 * Hex string opacity of the chevron's backdrop.
 * Keep it high enough that it doesn't look noisy but still let the user see what
 * content is obscured by the chevron.
 */
const CHEVRON_BACKDROP_OPACITY = 'E6';

/**
 * Width of the gradient that indicates that there is more content to the left/right.
 */
const FADE_WIDTH = 56;

/**
 * The gradients fade in/out if the user scroll to or away from the edge of
 * the content.
 * This specifies the duration of the fade animation in milliseconds.
 */
const FADE_DURATION = 150;

/** Absorbs subpixel rounding so a fade doesn't linger at either content edge. */
const SCROLL_EPSILON = 1;

/** How much of the viewport pressing a chevron scrolls. */
const PAGE_FRACTION = 0.6;

type Side = 'left' | 'right';

type HorizontalScrollGroupProps = {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /**
   * The background color sitting behind the group.
   * Used by the edge fade gradient.
   */
  surfaceColor?: string;
} & ComponentProps<typeof View>;

/** Current scroll information that we mutate on update. */
type Metrics = {
  offset: number;
  viewport: number;
  content: number;
};

/**
 * Container for content that scrolls horizontally without a scroll bar.
 *
 * If there is more content to the left or right of the visible region,
 * a fade will be shown at that edge to indicate this.
 *
 * On mobile, swiping to scroll left or right is easy, but we need the
 * fade to show when there is content to scroll to.
 *
 * On web, side scrolling may be difficult, so we map vertical scrolling
 * to scroll horizontally instead and also display chevrons on hover that
 * can jump left/right.
 */
export function HorizontalScrollGroup({
  children,
  style,
  contentContainerStyle,
  surfaceColor,
  ...props
}: HorizontalScrollGroupProps) {
  const { theme } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const metrics = useRef<Metrics>({ offset: 0, viewport: 0, content: 0 });
  const [edges, setEdges] = useState({
    canScrollLeft: false,
    canScrollRight: false,
  });

  const { hovered, onHoverIn, onHoverOut } = useWebHover();
  useHorizontalWheelScroll(scrollRef);

  // Determine whether we can scroll left or right.
  const syncScrollAbility = () => {
    const { offset, viewport, content } = metrics.current;
    const left = offset > SCROLL_EPSILON;
    const right = offset + viewport < content - SCROLL_EPSILON;

    // Return the same object reference if nothing changed:
    setEdges((prev) =>
      prev.canScrollLeft === left && prev.canScrollRight === right
        ? prev
        : { canScrollLeft: left, canScrollRight: right },
    );
  };

  // Update metrics and whether we can scroll left/right from the new
  // scroll position.
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;

    metrics.current = {
      offset: contentOffset.x,
      viewport: layoutMeasurement.width,
      content: contentSize.width,
    };
    syncScrollAbility();
  };

  const onLayout = (event: LayoutChangeEvent) => {
    metrics.current.viewport = event.nativeEvent.layout.width;
    syncScrollAbility();
  };

  const onContentSizeChange = (width: number) => {
    metrics.current.content = width;
    syncScrollAbility();
  };

  const scrollByPage = (direction: 1 | -1) => {
    const { offset, viewport, content } = metrics.current;

    const end = Math.max(0, content - viewport);
    const change = direction * viewport * PAGE_FRACTION;
    const next = Math.min(end, Math.max(0, offset + change));

    scrollRef.current?.scrollTo({ x: next, animated: true });
  };

  const resolvedSurface = surfaceColor ?? theme.palette.neutral_0;

  // We use a neutral color different from the background color so that
  // it is easy to see but does not clash.
  const chevronBackdrop = withHexOpacity(
    theme.palette.neutral_50,
    CHEVRON_BACKDROP_OPACITY,
  );

  return (
    <View
      {...props}
      style={[Atoms.relative, Atoms.overflow_hidden, style]}
      // Handle hover and coalesce `null` to `undefined` to make the type system happy.
      onPointerEnter={onHoverIn ?? undefined}
      onPointerLeave={onHoverOut ?? undefined}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        // Prevent growing vertically:
        style={Atoms.flex_grow_0}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onLayout={onLayout}
        onContentSizeChange={onContentSizeChange}
        contentContainerStyle={[styles.content, contentContainerStyle]}
      >
        {children}
      </ScrollView>

      {/** Show fades only when not hovering and we can scroll in the relevant direction. */}
      <EdgeFade
        side="left"
        visible={edges.canScrollLeft && !hovered}
        color={resolvedSurface}
      />
      <EdgeFade
        side="right"
        visible={edges.canScrollRight && !hovered}
        color={resolvedSurface}
      />

      {/** Show chevrons on web when we are hovering and can scroll. */}
      {isWeb && (
        <>
          <EdgeChevron
            side="left"
            visible={edges.canScrollLeft && hovered}
            backgroundColor={chevronBackdrop}
            onPress={() => scrollByPage(-1)}
          />
          <EdgeChevron
            side="right"
            visible={edges.canScrollRight && hovered}
            backgroundColor={chevronBackdrop}
            onPress={() => scrollByPage(1)}
          />
        </>
      )}
    </View>
  );
}

/**
 * Position an overlay against one edge.
 */
function edgeAnchor(side: Side, inset = 0): ViewStyle {
  return side === 'left' ? { left: inset } : { right: inset };
}

/** Fades the row out towards `side`, indicating there is content past the edge. */
function EdgeFade({
  side,
  visible,
  color,
}: {
  side: Side;
  visible: boolean;
  color: string;
}) {
  // SVG ids need to be document-global on web, so keep them unique per instance.
  const gradientId = `fade-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}-${side}`;

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(visible ? 1 : 0, { duration: FADE_DURATION }),
  }));

  return (
    <Animated.View
      style={[styles.overlay, styles.fade, edgeAnchor(side), animatedStyle]}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <Stop
              offset="0"
              stopColor={color}
              stopOpacity={side === 'left' ? 1 : 0}
            />
            <Stop
              offset="1"
              stopColor={color}
              stopOpacity={side === 'left' ? 0 : 1}
            />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * Web-only paging button.

 * Scrolling horizontally is easy on mobile but not all mice support horizontal
 * scrolling.
 * Users may be aware that we remap vertical scrolling to horizontal here,
 * so we should still display paging buttons to go left and right.
 */
function EdgeChevron({
  side,
  visible,
  backgroundColor,
  onPress,
}: {
  side: Side;
  visible: boolean;
  backgroundColor: string;
  onPress: () => void;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(visible ? 1 : 0, { duration: FADE_DURATION }),
  }));

  return (
    <Animated.View
      aria-hidden={!visible}
      style={[
        styles.overlay,
        styles.chevron,
        edgeAnchor(side, CHEVRON_INSET),
        { pointerEvents: visible ? 'auto' : 'none' },
        animatedStyle,
      ]}
    >
      <View style={[styles.chevronBackdrop, { backgroundColor }]}>
        <IconButton
          size="sm"
          onPress={onPress}
          accessibilityLabel={side === 'left' ? 'Scroll left' : 'Scroll right'}
          icon={({ size, color }) => (
            <Icon
              name={side === 'left' ? 'chevronBack' : 'chevronForward'}
              size={size}
              color={color}
            />
          )}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    zIndex: ZIndex.raised,
  },
  fade: {
    width: FADE_WIDTH,
    pointerEvents: 'none',
  },
  chevron: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronBackdrop: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
});
