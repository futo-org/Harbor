import { useWebHover } from '@/src/common/lib/useWebHover';
import { Atoms, createThemedStyles, withHexOpacity } from '@/src/common/theme';
import { Image, type ImageProps } from 'expo-image';
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewProps,
} from 'react-native';

export type AvatarSizePreset = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'massive';

export const AVATAR_SIZE_MAP: Record<AvatarSizePreset, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 112,
  massive: 170,
};

export function resolveAvatarSize(size: AvatarSizePreset | number): number {
  return typeof size === 'number' ? size : AVATAR_SIZE_MAP[size];
}

type AvatarSizeRequest = {
  /** The size in device pixels that the Avatar will be displayed. */
  displayPixels: number;

  /**
   * Minimum size in device pixels that should be accepted here in variant
   * selection.
   */
  minPixels: number;
};

/**
 * Derive device pixel sizes from the logical pixel size requested.
 */
export function useAvatarSizeRequest(
  /** Logical pixel size. */
  size: AvatarSizePreset | number,

  /** Value from 0 to 1 that reduces the minimum size. */
  slack: number = 0,
): AvatarSizeRequest {
  const { scale } = useWindowDimensions();
  const scaled = resolveAvatarSize(size) * scale;

  const displayPixels = Math.ceil(scaled);
  const minPixels = Math.ceil(scaled * (1 - slack));

  return { displayPixels, minPixels };
}

interface AvatarProps extends Omit<ImageProps, 'source'> {
  source?: ImageProps['source'];
  /**
   * Forces the image to clear + reload when it changes — set this when an
   * Avatar lives in a recycled list row (FlashList) so a reused cell never
   * flashes the previous identity's avatar. Defaults to the source URI.
   */
  recyclingKey?: string;
  size?: AvatarSizePreset | number;
  containerProps?: ViewProps;
  onPress?: () => void;
}

/** Pull a stable string URI out of an Image source for recycling. */
function sourceUri(source: ImageProps['source']): string | undefined {
  if (typeof source === 'string') return source;
  if (source && typeof source === 'object' && 'uri' in source) {
    return typeof source.uri === 'string' ? source.uri : undefined;
  }
  return undefined;
}

export function Avatar({
  source,
  recyclingKey,
  size: sizeProp = 'md',
  containerProps,
  onPress,
  ...imageProps
}: AvatarProps) {
  const styles = useStyles();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();
  const { style: imageStyle, ...restImageProps } = imageProps;
  const label = imageProps.accessibilityLabel ?? imageProps.alt;

  const size = resolveAvatarSize(sizeProp);

  const circleStyle = [
    styles.circle,
    { width: size, height: size },
    containerProps?.style,
  ];

  const image = (
    <>
      <Image
        cachePolicy="memory-disk"
        // Fades in rather than popping when it lands a frame after the row.
        transition={150}
        {...restImageProps}
        source={source}
        recyclingKey={recyclingKey ?? sourceUri(source)}
        contentFit="cover"
        style={[styles.image, imageStyle]}
      />
      <View pointerEvents="none" style={styles.safetyRing} />
    </>
  );

  if (!onPress) {
    return (
      <View
        accessibilityRole={label ? 'image' : undefined}
        accessibilityLabel={label}
        {...containerProps}
        style={circleStyle}
      >
        {image}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      {...containerProps}
      onPress={onPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      style={({ pressed }) => [circleStyle, pressed && styles.pressed]}
    >
      {image}
      {hovered && <View pointerEvents="none" style={styles.hoverOverlay} />}
    </Pressable>
  );
}

const useStyles = createThemedStyles((theme, define) =>
  define({
    circle: [
      Atoms.overflow_hidden,
      Atoms.rounded_full,
      { backgroundColor: theme.palette.background_primary },
    ],
    image: [Atoms.w_full, Atoms.h_full],
    pressed: { opacity: 0.5 },
    safetyRing: [
      StyleSheet.absoluteFill,
      Atoms.rounded_full,
      {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: withHexOpacity(theme.palette.neutral_500, '40'),
      },
    ],
    hoverOverlay: [
      StyleSheet.absoluteFill,
      Atoms.rounded_full,
      { backgroundColor: withHexOpacity(theme.palette.black, '28') },
    ],
  }),
);
