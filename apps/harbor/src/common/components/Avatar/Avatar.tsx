import { useWebHover } from '@/src/common/lib/useWebHover';
import { useTheme, withHexOpacity } from '@/src/common/theme';
import { Image, type ImageProps } from 'expo-image';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';

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
  const { theme } = useTheme();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();
  const { style: imageStyle, ...restImageProps } = imageProps;
  const label = imageProps.accessibilityLabel ?? imageProps.alt;

  const size = resolveAvatarSize(sizeProp);

  const radius = size / 2;
  const circleStyle = [
    styles.clip,
    {
      width: size,
      height: size,
      borderRadius: radius,
      backgroundColor: theme.palette.background_primary,
    },
    {
      borderWidth: 1,
      borderColor: withHexOpacity(theme.palette.neutral_500, '80'),
    },
    containerProps?.style,
  ];

  const image = (
    <Image
      {...restImageProps}
      source={source}
      recyclingKey={recyclingKey ?? sourceUri(source)}
      contentFit="cover"
      style={[styles.image, imageStyle]}
    />
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
      style={({ pressed }) => [circleStyle, pressed && { opacity: 0.5 }]}
    >
      {image}
      <HoverOverlay visible={hovered} borderRadius={radius} />
    </Pressable>
  );
}

function HoverOverlay({
  visible,
  borderRadius,
}: {
  visible: boolean;
  borderRadius: number;
}) {
  const { theme } = useTheme();
  if (!visible) return null;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.overlayFill,
        {
          borderRadius,
          backgroundColor: withHexOpacity(theme.palette.black, '28'),
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlayFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
});
