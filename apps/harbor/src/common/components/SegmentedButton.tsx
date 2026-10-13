import { useWebHover } from '@/src/common/lib/useWebHover';
import { Atoms, BorderRadius, useTheme, ZIndex } from '@/src/common/theme';
import { type ComponentProps, Fragment, useEffect, useState } from 'react';
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Icon, { type IconName } from './Icon';
import { Text } from './primitives';

const SELECTION_ANIMATION_DURATION_MS = 200;

type SegmentData = {
  label: string;
  active?: boolean;
  icon?: IconName;
  onPress?: () => void;
};

type SegmentedButtonProps = {
  segments: SegmentData[];
} & ComponentProps<typeof View>;

/** A segment's position within the track, as reported by `onLayout`. */
type SegmentFrame = { x: number; width: number; height: number };

const LEFT_ROUNDED = {
  borderTopLeftRadius: BorderRadius.full,
  borderBottomLeftRadius: BorderRadius.full,
};

const RIGHT_ROUNDED = {
  borderTopRightRadius: BorderRadius.full,
  borderBottomRightRadius: BorderRadius.full,
};

/**
 * A row of button segments that function like radio buttons.
 * The active segment is covered by a filled indicator that slides between
 * segments; inactive ones sit on a track outlined with a hairline border.
 */
export function SegmentedButton({
  segments,
  style,
  ...props
}: SegmentedButtonProps) {
  const { theme } = useTheme();
  const [segmentFrames, setSegmentFrames] = useState<SegmentFrame[]>([]);

  const activeIndex = segments.findIndex((segment) => segment.active);
  const activeFrame = segmentFrames[activeIndex];

  const updateSegmentFrame = (index: number) => (event: LayoutChangeEvent) => {
    const { x, width, height } = event.nativeEvent.layout;
    setSegmentFrames((frames) => {
      const updatedFrames = [...frames];
      updatedFrames[index] = { x, width, height };
      return updatedFrames;
    });
  };

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.rounded_full,
        {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.palette.neutral_50,
          backgroundColor: theme.palette.neutral_25,
        },
        style,
      ]}
      {...props}
    >
      {segments.map(({ label, active = false, icon, onPress }, index) => (
        <Fragment key={label}>
          {index > 0 && <SegmentSeparator />}
          <Segment
            label={label}
            isFirst={index === 0}
            isLast={index === segments.length - 1}
            active={active}
            // The track's indicator needs the segment's layout, so the first
            // render draws it inside the segment instead.
            showsStaticIndicator={active && !activeFrame}
            icon={icon}
            onPress={onPress}
            onLayout={updateSegmentFrame(index)}
          />
        </Fragment>
      ))}
      {/* Last, to draw above the separators; segments are raised above it. */}
      {activeFrame && (
        <ActiveSegmentIndicator
          frame={activeFrame}
          isFirst={activeIndex === 0}
          isLast={activeIndex === segments.length - 1}
        />
      )}
    </View>
  );
}

/**
 * The filled background behind the active segment. It covers the segment's
 * separators and the track border next to it, and animates its position and
 * rounding when the active segment changes.
 */
function ActiveSegmentIndicator({
  frame,
  isFirst,
  isLast,
}: {
  frame: SegmentFrame;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { theme } = useTheme();

  // `frame.x` includes the track's left border, while absolute offsets start
  // inside it; one more hairline covers the separator.
  const left = frame.x - 2 * StyleSheet.hairlineWidth;
  const width = frame.width + 2 * StyleSheet.hairlineWidth;
  // Half the track's height, matching its fully rounded ends. An explicit
  // value, since animating from `BorderRadius.full` would only visibly change
  // the rounding at the very end.
  const endRadius = frame.height / 2 + StyleSheet.hairlineWidth;
  const leftRadius = isFirst ? endRadius : 0;
  const rightRadius = isLast ? endRadius : 0;

  const animatedLeft = useSharedValue(left);
  const animatedWidth = useSharedValue(width);
  const animatedLeftRadius = useSharedValue(leftRadius);
  const animatedRightRadius = useSharedValue(rightRadius);

  useEffect(() => {
    const timing = { duration: SELECTION_ANIMATION_DURATION_MS };
    animatedLeft.value = withTiming(left, timing);
    animatedWidth.value = withTiming(width, timing);
    animatedLeftRadius.value = withTiming(leftRadius, timing);
    animatedRightRadius.value = withTiming(rightRadius, timing);
  }, [
    left,
    width,
    leftRadius,
    rightRadius,
    animatedLeft,
    animatedWidth,
    animatedLeftRadius,
    animatedRightRadius,
  ]);

  const indicatorStyle = useAnimatedStyle(() => ({
    left: animatedLeft.value,
    width: animatedWidth.value,
    borderTopLeftRadius: animatedLeftRadius.value,
    borderBottomLeftRadius: animatedLeftRadius.value,
    borderTopRightRadius: animatedRightRadius.value,
    borderBottomRightRadius: animatedRightRadius.value,
  }));

  return (
    <Animated.View
      style={[
        Atoms.absolute,
        {
          // Covers the track's top and bottom border.
          top: -StyleSheet.hairlineWidth,
          bottom: -StyleSheet.hairlineWidth,
          backgroundColor: theme.palette.primary_500,
        },
        indicatorStyle,
      ]}
    />
  );
}

/**
 * A single pressable segment within a `SegmentedButton`. Its content is
 * rendered twice, in the inactive and active colors, and cross-faded.
 */
function Segment({
  label,
  isFirst,
  isLast,
  active,
  showsStaticIndicator,
  icon,
  onPress,
  onLayout,
}: {
  label: string;
  isFirst: boolean;
  isLast: boolean;
  active: boolean;
  showsStaticIndicator: boolean;
  icon?: IconName;
  onPress?: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  const { theme } = useTheme();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  const activeProgress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    activeProgress.value = withTiming(active ? 1 : 0, {
      duration: SELECTION_ANIMATION_DURATION_MS,
    });
  }, [active, activeProgress]);

  const inactiveContentStyle = useAnimatedStyle(() => ({
    opacity: 1 - activeProgress.value,
  }));
  const activeContentStyle = useAnimatedStyle(() => ({
    opacity: activeProgress.value,
  }));

  const contentStyle = [
    Atoms.flex_row,
    Atoms.align_center,
    Atoms.justify_center,
    Atoms.gap_xs,
    Atoms.p_sm,
  ];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      onLayout={onLayout}
      style={[
        hovered && !active
          ? // A hovered segment stays below the indicator, so on web its
            // background can't cover the indicator's edge after pixel rounding.
            { backgroundColor: theme.palette.neutral_50 }
          : { zIndex: ZIndex.raised },
        // Keeps the hover background inside the track's rounded ends.
        isFirst && LEFT_ROUNDED,
        isLast && RIGHT_ROUNDED,
      ]}
    >
      {showsStaticIndicator && (
        <StaticSegmentIndicator isFirst={isFirst} isLast={isLast} />
      )}
      <Animated.View style={[contentStyle, inactiveContentStyle]}>
        <SegmentContent label={label} icon={icon} color="neutral_500" />
      </Animated.View>
      <Animated.View
        style={[StyleSheet.absoluteFill, contentStyle, activeContentStyle]}
      >
        <SegmentContent label={label} icon={icon} color="white" />
      </Animated.View>
    </Pressable>
  );
}

/**
 * The active segment's filled background, drawn inside the segment itself
 * until `ActiveSegmentIndicator` has the segment's layout to take over.
 */
function StaticSegmentIndicator({
  isFirst,
  isLast,
}: {
  isFirst: boolean;
  isLast: boolean;
}) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        Atoms.absolute,
        {
          // Covers the separators and track border around the segment,
          // like `ActiveSegmentIndicator`.
          top: -StyleSheet.hairlineWidth,
          bottom: -StyleSheet.hairlineWidth,
          left: -StyleSheet.hairlineWidth,
          right: -StyleSheet.hairlineWidth,
          backgroundColor: theme.palette.primary_500,
        },
        isFirst && LEFT_ROUNDED,
        isLast && RIGHT_ROUNDED,
      ]}
    />
  );
}

/** A hairline between two segments, matching the track border. */
function SegmentSeparator() {
  const { theme } = useTheme();

  return (
    <View
      style={{
        width: StyleSheet.hairlineWidth,
        backgroundColor: theme.palette.neutral_50,
      }}
    />
  );
}

function SegmentContent({
  label,
  icon,
  color,
}: {
  label: string;
  icon?: IconName;
  color: 'neutral_500' | 'white';
}) {
  return (
    <>
      {icon && <Icon name={icon} size={12} color={color} />}
      <Text
        variant="small"
        fontWeight="semibold"
        color={color}
        selectable={false}
        numberOfLines={1}
      >
        {label}
      </Text>
    </>
  );
}
