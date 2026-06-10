import { Text } from '@/src/common/components/primitives';
import {
  pickImageVariant,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import Icon from '@/src/common/components/Icon';
import { v2 } from '@polycentric/react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
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

/** Pull the largest available variant for the viewer. */
const VIEWER_TARGET = 2048;

type ViewerSource = {
  uri: string;
  aspectRatio: number;
};

/**
 * Full-screen image viewer for post attachments. Tap the backdrop or
 * the close button to dismiss; pinch in or swipe up/down to close;
 * left/right arrows (and keyboard arrows on web) navigate between images
 * when there's more than one.
 */
export function ImageViewer({
  images,
  initialIndex,
  onClose,
}: {
  images: v2.ImageSet[];
  initialIndex: number;
  onClose: () => void;
}) {
  const client = usePolycentric();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const sources = useMemo<ViewerSource[]>(
    () =>
      images
        .map((imageSet) => {
          const variant = pickImageVariant(imageSet, VIEWER_TARGET);
          const digest = variant?.blob?.digest;
          if (!digest) return null;
          const uri = client.blobUrl(digest);
          if (!uri) return null;
          const w = variant.width || 1;
          const h = variant.height || 1;
          return { uri, aspectRatio: w / h };
        })
        .filter((s): s is ViewerSource => s != null),
    [client, images],
  );

  const [index, setIndex] = useState(initialIndex);
  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(
    () => setIndex((i) => Math.min(sources.length - 1, i + 1)),
    [sources.length],
  );

  // Web: Esc closes, arrow keys navigate.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, goPrev, goNext]);

  const { height } = useWindowDimensions();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const dismissY = useSharedValue(0);

  // Reset zoom/pan whenever the displayed image changes.
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
              if (finished) runOnJS(onClose)();
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

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          if (scale.value > 1) {
            translateX.value = savedTranslateX.value + e.translationX;
            translateY.value = savedTranslateY.value + e.translationY;
          } else if (scale.value === 1) {
            // Only drag-to-dismiss at natural size; ignore the centroid
            // drift while a pinch is shrinking the image.
            dismissY.value = e.translationY;
          }
        })
        .onEnd((e) => {
          if (scale.value > 1) {
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
            return;
          }
          if (scale.value < 1) {
            // A pinch-to-close is in progress; let the pinch decide
            // whether to dismiss, so we don't double-fire onClose (which
            // on Android popped an extra screen).
            dismissY.value = withTiming(0, { duration: 150 });
            return;
          }
          const dismiss =
            Math.abs(e.translationY) > CLOSE_DISTANCE ||
            Math.abs(e.velocityY) > CLOSE_VELOCITY;
          if (dismiss) {
            const target = e.translationY >= 0 ? height : -height;
            dismissY.value = withTiming(
              target,
              { duration: 180 },
              (finished) => {
                if (finished) runOnJS(onClose)();
              },
            );
          } else {
            dismissY.value = withTiming(0, { duration: 150 });
          }
        }),
    [
      height,
      onClose,
      scale,
      translateX,
      translateY,
      savedTranslateX,
      savedTranslateY,
      dismissY,
    ],
  );

  const gesture = useMemo(() => Gesture.Simultaneous(pinch, pan), [pinch, pan]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value + dismissY.value },
      { scale: scale.value },
    ],
  }));
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

  if (sources.length === 0) return null;
  const safeIndex = Math.min(index, sources.length - 1);
  const current = sources[safeIndex];
  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < sources.length - 1;

  const chipBg = withHexOpacity(theme.palette.black, 'b0');

  // Rendered as a full-screen route (app/image-viewer.tsx) declaring
  // `screenOrientation: 'all'`, so it rotates to landscape and fills the
  // screen while the rest of the app stays portrait. The route provides
  // the (transparent-modal) presentation; here we just fill it.
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
      <Pressable
        onPress={onClose}
        style={[Atoms.flex_1, Atoms.items_center, Atoms.justify_center]}
      >
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={[
              Atoms.items_center,
              Atoms.justify_center,
              { width: '100%', height: '88%' },
              imageStyle,
            ]}
          >
            {/* Swallow taps on the image itself so they don't dismiss;
                  taps on the surrounding letterbox fall through to the
                  backdrop and close. */}
            <Pressable
              onPress={(e) => e.stopPropagation?.()}
              style={[
                Atoms.w_full,
                { aspectRatio: current.aspectRatio, maxHeight: '100%' },
              ]}
            >
              <Image
                source={{ uri: current.uri }}
                resizeMode="contain"
                style={[Atoms.w_full, Atoms.h_full]}
              />
            </Pressable>
          </Animated.View>
        </GestureDetector>

        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onClose();
          }}
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
      </Pressable>
    </GestureHandlerRootView>
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
      onPress={(e) => {
        e.stopPropagation?.();
        onPress();
      }}
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
