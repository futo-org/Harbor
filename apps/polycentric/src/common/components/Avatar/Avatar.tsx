import { useWebHover } from '@/src/common/lib/useWebHover';
import { useTheme, withHexOpacity } from '@/src/common/theme';
import {
  Image,
  ImageProps,
  ImageSourcePropType,
  Pressable,
  StyleSheet,
  View,
  type ViewProps,
} from 'react-native';

export type AvatarSizePreset = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'massive';

export const AVATAR_SIZE_MAP: Record<AvatarSizePreset, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
  massive: 170,
};

export function resolveAvatarSize(size: AvatarSizePreset | number): number {
  return typeof size === 'number' ? size : AVATAR_SIZE_MAP[size];
}

interface AvatarProps extends Omit<ImageProps, 'source'> {
  source?: ImageSourcePropType;
  size?: AvatarSizePreset | number;
  containerProps?: ViewProps;
  onPress?: () => void;
}

export function Avatar({
  source,
  size: sizeProp = 'md',
  containerProps,
  onPress,
  ...imageProps
}: AvatarProps) {
  const { theme } = useTheme();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();
  const { style: imageStyle, ...restImageProps } = imageProps;

  const size = resolveAvatarSize(sizeProp);
  const showHoverDim = !!onPress && hovered;

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

  return (
    <Pressable
      {...containerProps}
      accessibilityRole="button"
      onPress={onPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      style={circleStyle}
    >
      <Image
        {...restImageProps}
        source={source}
        resizeMode={'cover'}
        style={[styles.image, imageStyle]}
      />
      <HoverOverlay visible={showHoverDim} borderRadius={size / 2} />
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
