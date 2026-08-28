import { Text } from '@/src/common/components/primitives';
import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import Icon from '@/src/common/components/Icon';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  resolveImageSources,
  type ImageViewerInput,
  type ResolvedImageSource,
} from './resolveImageSources';
import { Image } from '@/src/common/components/Image';
import {
  Platform,
  Pressable,
  useWindowDimensions,
  View,
  StyleSheet,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Vertical drag (px) past which releasing dismisses the viewer. */
const CLOSE_DISTANCE = 120;
/** Vertical fling velocity (px/s) that dismisses regardless of distance. */
const CLOSE_VELOCITY = 800;
/** Maximum pinch-zoom magnification. */
const MAX_SCALE = 5;
/** Releasing a pinch below this scale dismisses the viewer. */
const PINCH_CLOSE_SCALE = 0.8;
/** Horizontal fling velocity (px/s) that commits a swipe to the neighbor. */
const SWIPE_VELOCITY = 500;
/** Drag (px) before a pan locks to horizontal (swipe) or vertical (dismiss). */
const AXIS_LOCK_SLOP = 10;
/** Image pane height as a fraction of the viewer */
const PANE_HEIGHT = 0.88;

/**
 * Full-screen viewer for any `ImageSet`s (post attachments, avatars,
 * ...). Tap the backdrop or
 * the close button to dismiss; pinch in or swipe up/down to close;
 * swipe left/right, use left/right arrows or keyboard arrows to navigate
 * between images when there's more than one.
 */
export function ImageViewer({
  images,
  initialIndex,
  onClose,
  onIndexChange,
}: {
  images: ImageViewerInput[];
  initialIndex: number;
  onClose: (source: string) => void;
  onIndexChange?: (index: number) => void;
}) {
  const client = usePolycentric();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const sources = useMemo(
    () => resolveImageSources(images, (digest) => client.blobUrls(digest)),
    [client, images],
  );

  const [index, setIndex] = useState(initialIndex);
  const count = sources.length;
  const safeIndex = Math.min(index, count - 1);

  const { height, width } = useWindowDimensions();

  // Strip position
  const offsetX = useSharedValue(-initialIndex * width);

  // Snap offset to correct index if changed from the outside
  useEffect(() => {
    setIndex((prev) => {
      if (initialIndex === prev) return prev;

      offsetX.value = -initialIndex * width;
      return initialIndex;
    });
  }, [initialIndex, offsetX, width]);

  // Keep the strip position up-to-date
  // biome-ignore lint/correctness/useExhaustiveDependencies: only width/count changes should snap; safeIndex is read fresh
  useEffect(() => {
    offsetX.value = -Math.max(0, safeIndex) * width;
  }, [width, count]);

  const goTo = useCallback(
    (i: number) => {
      setIndex(i);
      offsetX.value = withTiming(-i * width, { duration: 200 });
    },
    [offsetX, width],
  );
  const goPrev = useCallback(
    () => goTo(Math.max(0, safeIndex - 1)),
    [goTo, safeIndex],
  );
  const goNext = useCallback(
    () => goTo(Math.min(count - 1, safeIndex + 1)),
    [goTo, safeIndex, count],
  );

  // Report arrow/keyboard navigation, skipping the mount-time index.
  const firstMount = useRef(true);
  useEffect(() => {
    if (firstMount.current) {
      firstMount.current = false;
      return;
    }
    onIndexChange?.(index);
  }, [index, onIndexChange]);

  // Web: Esc closes, arrow keys navigate.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose('esc');
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, goPrev, goNext]);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const dismissY = useSharedValue(0);
  // Drag axis, swipe ('x') vs dismiss ('y')
  const axis = useSharedValue<'none' | 'x' | 'y'>('none');
  // Strip position when a horizontal drag locked in, so a grab during a
  // settle animation continues from where the strip is, not a jump.
  const swipeStartX = useSharedValue(0);

  // Reset zoom/pan whenever the displayed image changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `index` is the reset trigger, not a capture
  useEffect(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    dismissY.value = 0;
  }, [
    index,
    scale,
    savedScale,
    translateX,
    translateY,
    savedTranslateX,
    savedTranslateY,
    dismissY,
  ]);

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onUpdate((e) => {
          scale.value = Math.min(savedScale.value * e.scale, MAX_SCALE);
        })
        .onEnd(() => {
          if (scale.value < PINCH_CLOSE_SCALE) {
            // Pinched in far enough — shrink away and dismiss.
            scale.value = withTiming(0.3, { duration: 180 }, (finished) => {
              if (finished) runOnJS(onClose)('PINCH_CLOSE_SCALE');
            });
          } else if (scale.value <= 1) {
            scale.value = withTiming(1);
            savedScale.value = 1;
            translateX.value = withTiming(0);
            translateY.value = withTiming(0);
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
          } else {
            savedScale.value = scale.value;
          }
        }),
    [
      onClose,
      scale,
      savedScale,
      translateX,
      translateY,
      savedTranslateX,
      savedTranslateY,
    ],
  );

  const swipeEnabled = count > 1;

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          if (scale.value > 1) {
            translateX.value = savedTranslateX.value + e.translationX;
            translateY.value = savedTranslateY.value + e.translationY;
            return;
          }

          // Only act at natural size; ignore the centroid drift while a
          // pinch is shrinking the image.
          if (scale.value < 1) return;

          // Lock to the pan axis
          if (axis.value === 'none') {
            const ax = Math.abs(e.translationX);
            const ay = Math.abs(e.translationY);
            if (Math.max(ax, ay) < AXIS_LOCK_SLOP) return;
            axis.value = swipeEnabled && ax > ay ? 'x' : 'y';
            if (axis.value === 'x') {
              swipeStartX.value = offsetX.value - e.translationX;
            }
          }

          // Swipe
          if (axis.value === 'x') {
            const raw = swipeStartX.value + e.translationX;
            const min = -(count - 1) * width;
            const clamped = Math.min(0, Math.max(min, raw));
            // Rubber-band when dragging past the first/last image.
            offsetX.value = clamped + (raw - clamped) / 3;
          }
          // Dismiss
          else {
            dismissY.value = e.translationY;
          }
        })
        .onEnd((e) => {
          if (scale.value > 1) {
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
            // Settle the strip in case a pinch interrupted a swipe.
            offsetX.value = withTiming(-safeIndex * width, { duration: 200 });
            return;
          }
          if (scale.value < 1) {
            // A pinch-to-close is in progress; let the pinch decide
            // whether to dismiss, so we don't double-fire onClose (which
            // on Android popped an extra screen).
            dismissY.value = withTiming(0, { duration: 150 });
            return;
          }

          // Swipe
          if (axis.value === 'x') {
            // A fling commits to the neighbor in its direction; otherwise
            // commit once the drag passed a third of the screen.
            let target: number;

            if (Math.abs(e.velocityX) > SWIPE_VELOCITY) {
              target = e.velocityX < 0 ? safeIndex + 1 : safeIndex - 1;
            } else {
              const progress = -offsetX.value / width - safeIndex;
              target =
                progress > 1 / 3
                  ? safeIndex + 1
                  : progress < -1 / 3
                    ? safeIndex - 1
                    : safeIndex;
            }

            target = Math.max(0, Math.min(count - 1, target));
            offsetX.value = withTiming(-target * width, { duration: 200 });

            if (target !== safeIndex) runOnJS(setIndex)(target);
          }
          // Dismiss
          else {
            const dismiss =
              Math.abs(e.translationY) > CLOSE_DISTANCE ||
              Math.abs(e.velocityY) > CLOSE_VELOCITY;

            if (dismiss) {
              const dreason =
                Math.abs(e.translationY) > CLOSE_DISTANCE
                  ? 'CLOSE_DISTANCE'
                  : 'CLOSE_VELOCITY';

              const target = e.translationY >= 0 ? height : -height;
              dismissY.value = withTiming(
                target,
                { duration: 180 },
                (finished) => {
                  if (finished) runOnJS(onClose)(dreason);
                },
              );
            } else {
              dismissY.value = withTiming(0, { duration: 150 });
            }
          }
        })
        .onFinalize(() => {
          axis.value = 'none';
        }),
    [
      swipeEnabled,
      safeIndex,
      count,
      width,
      height,
      onClose,
      scale,
      translateX,
      translateY,
      savedTranslateX,
      savedTranslateY,
      dismissY,
      offsetX,
      axis,
      swipeStartX,
    ],
  );

  const aspectRatio = sources[safeIndex]?.aspectRatio ?? 1;

  // Detector's full-screen layout, for the backdrop-tap hit test.
  const containerSize = useSharedValue({ w: 0, h: 0 });

  const tap = useMemo(
    () =>
      Gesture.Tap().onEnd((e) => {
        // Contain-fit rect of the current image inside its pane (the pane
        // is PANE_HEIGHT of the container, letterboxing inside it), mapped
        // through the current transform: strip offset (0 when settled),
        // scale about the center, then translate. Taps outside that rect
        // dismiss the viewer.
        const fittedWidth = Math.min(
          containerSize.value.w,
          containerSize.value.h * PANE_HEIGHT * aspectRatio,
        );
        const fittedHeight = fittedWidth / aspectRatio;
        const currentScale = scale.value;
        const imgCenterX =
          containerSize.value.w / 2 +
          offsetX.value +
          safeIndex * width +
          translateX.value;
        const imgCenterY =
          containerSize.value.h / 2 + translateY.value + dismissY.value;

        const tappedOnImage =
          Math.abs(e.x - imgCenterX) <= (fittedWidth * currentScale) / 2 &&
          Math.abs(e.y - imgCenterY) <= (fittedHeight * currentScale) / 2;

        if (!tappedOnImage) runOnJS(onClose)('backdrop tap');
      }),
    [
      aspectRatio,
      containerSize,
      onClose,
      scale,
      translateX,
      translateY,
      dismissY,
      offsetX,
      safeIndex,
      width,
    ],
  );

  const gesture = useMemo(
    () => Gesture.Race(tap, Gesture.Simultaneous(pinch, pan)),
    [tap, pinch, pan],
  );

  const backdropStyle = useAnimatedStyle(() => {
    // Fade with whichever dismiss gesture is in progress: a vertical
    // drag, or a pinch shrinking the image below natural size.
    const dragProgress = Math.abs(dismissY.value) / (height * 0.5);
    const pinchProgress =
      scale.value < 1 ? (1 - scale.value) / (1 - PINCH_CLOSE_SCALE) : 0;
    const progress = Math.max(dragProgress, pinchProgress);
    return {
      opacity: interpolate(progress, [0, 1], [1, 0.2], Extrapolation.CLAMP),
    };
  });

  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < sources.length - 1;

  const chipBg = withHexOpacity(theme.palette.black, 'b0');

  // Rendered by the image-viewer routes (post images, profile photo),
  // declared with `orientation: 'all'`, so it rotates to landscape and
  // fills the screen while the rest of the app stays portrait. The route
  // provides the (transparent-modal) presentation; here we just fill it.
  return (
    <GestureHandlerRootView style={Atoms.flex_1}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'rgba(0,0,0,0.92)' },
          backdropStyle,
        ]}
      />
      <GestureDetector gesture={gesture}>
        <View
          style={[Atoms.flex_1, Atoms.overflow_hidden]}
          onLayout={(e) => {
            containerSize.value = {
              w: e.nativeEvent.layout.width,
              h: e.nativeEvent.layout.height,
            };
          }}
        >
          {sources.map((source, i) => (
            <ImagePane
              // biome-ignore lint/suspicious/noArrayIndexKey: panes are positional slots in the strip and never reorder
              key={`${i}-${source.uris[0]}`}
              source={source}
              paneX={i * width}
              isCurrent={i === safeIndex}
              offsetX={offsetX}
              scale={scale}
              translateX={translateX}
              translateY={translateY}
              dismissY={dismissY}
            />
          ))}
        </View>
      </GestureDetector>

      <Pressable
        onPress={() => onClose('close button press')}
        accessibilityLabel="Close image viewer"
        hitSlop={12}
        style={[
          Atoms.absolute,
          Atoms.items_center,
          Atoms.justify_center,
          Atoms.rounded_full,
          {
            top: insets.top,
            right: 16,
            width: 40,
            height: 40,
            backgroundColor: chipBg,
          },
        ]}
      >
        <Icon name="close" size={24} color="white" />
      </Pressable>

      {hasPrev && <NavArrow side="left" onPress={goPrev} bg={chipBg} />}
      {hasNext && <NavArrow side="right" onPress={goNext} bg={chipBg} />}

      {sources.length > 1 && (
        <View
          pointerEvents="none"
          style={[
            Atoms.absolute,
            Atoms.items_center,
            { top: 20, left: 0, right: 0 },
          ]}
        >
          <View
            style={[
              Atoms.px_sm,
              Atoms.py_xs,
              Atoms.rounded_lg,
              { backgroundColor: chipBg },
            ]}
          >
            <Text variant="small" style={{ color: theme.palette.white }}>
              {safeIndex + 1} / {sources.length}
            </Text>
          </View>
        </View>
      )}
    </GestureHandlerRootView>
  );
}

function ImagePane({
  source,
  paneX,
  isCurrent,
  offsetX,
  scale,
  translateX,
  translateY,
  dismissY,
}: {
  source: ResolvedImageSource;
  /** This pane's resting X within the strip (index × screen width). */
  paneX: number;
  isCurrent: boolean;
  offsetX: SharedValue<number>;
  scale: SharedValue<number>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  dismissY: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const stripX = offsetX.value + paneX;
    return {
      transform: isCurrent
        ? [
            { translateX: stripX + translateX.value },
            { translateY: translateY.value + dismissY.value },
            { scale: scale.value },
          ]
        : [{ translateX: stripX }],
    };
  });

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        Atoms.items_center,
        Atoms.justify_center,
        style,
      ]}
    >
      <View
        style={[
          Atoms.items_center,
          Atoms.justify_center,
          { width: '100%', height: `${PANE_HEIGHT * 100}%` },
        ]}
      >
        <View
          style={[
            Atoms.w_full,
            { aspectRatio: source.aspectRatio ?? 1, maxHeight: '100%' },
          ]}
        >
          <Image
            uris={source.uris}
            contentFit="contain"
            style={[Atoms.w_full, Atoms.h_full]}
          />
        </View>
      </View>
    </Animated.View>
  );
}

function NavArrow({
  side,
  onPress,
  bg,
}: {
  side: 'left' | 'right';
  onPress: () => void;
  bg: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityLabel={side === 'left' ? 'Previous image' : 'Next image'}
      style={[
        Atoms.absolute,
        Atoms.items_center,
        Atoms.justify_center,
        Atoms.rounded_full,
        {
          top: '50%',
          width: 44,
          height: 44,
          transform: [{ translateY: -22 }],
          backgroundColor: bg,
        },
        side === 'left' ? { left: 16 } : { right: 16 },
      ]}
    >
      <Icon
        name={side === 'left' ? 'chevronBack' : 'chevronForward'}
        size={28}
        color="white"
      />
    </Pressable>
  );
}
