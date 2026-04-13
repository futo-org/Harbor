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

const SIZE_MAP: Record<AvatarSizePreset, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
  massive: 170,
};

interface AvatarProps extends Omit<ImageProps, 'source'> {
  source?: ImageSourcePropType;
  size?: AvatarSizePreset | number;
  border?: boolean;
  borderWidth?: number;
  containerProps?: ViewProps;
  onPress?: () => void;
  disabled?: boolean;
}

export function Avatar({
  source,
  size: sizeProp = 'md',
  border = true,
  borderWidth = 1,
  containerProps,
  resizeMode = 'cover',
  onPress,
  disabled = false,
  ...imageProps
}: AvatarProps) {
  const { theme } = useTheme();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();
  const { style: imageStyle, ...restImageProps } = imageProps;

  const size = typeof sizeProp === 'number' ? sizeProp : SIZE_MAP[sizeProp];
  const showHoverDim = !!onPress && !disabled && hovered;

  const radius = size / 2;
  const circleStyle = [
    styles.clip,
    {
      width: size,
      height: size,
      borderRadius: radius,
      backgroundColor: theme.palette.background_primary,
    },
    border && {
      borderWidth,
      borderColor: withHexOpacity(theme.palette.neutral_500, '80'),
    },
    containerProps?.style,
  ];

  if (onPress) {
    return (
      <Pressable
        {...containerProps}
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        onHoverIn={disabled ? undefined : onHoverIn}
        onHoverOut={disabled ? undefined : onHoverOut}
        style={circleStyle}
      >
        <AvatarImage
          source={source}
          resizeMode={resizeMode}
          imageStyle={imageStyle}
          restImageProps={restImageProps}
        />
        <HoverOverlay visible={showHoverDim} borderRadius={size / 2} />
      </Pressable>
    );
  }

  return (
    <View {...containerProps} style={circleStyle}>
      <AvatarImage
        source={source}
        resizeMode={resizeMode}
        imageStyle={imageStyle}
        restImageProps={restImageProps}
      />
    </View>
  );
}

function AvatarImage({
  source,
  resizeMode,
  imageStyle,
  restImageProps,
}: {
  source?: ImageSourcePropType;
  resizeMode: ImageProps['resizeMode'];
  imageStyle: ImageProps['style'];
  restImageProps: Omit<ImageProps, 'source' | 'style' | 'resizeMode'>;
}) {
  return (
    <Image
      {...restImageProps}
      source={source}
      resizeMode={resizeMode}
      style={[styles.image, imageStyle]}
    />
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
