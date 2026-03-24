import {
  Image,
  ImageProps,
  ImageSourcePropType,
  StyleSheet,
  View,
  ViewProps,
} from 'react-native';
import { useTheme } from '@/theme';

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
  border?: false | 'neutral' | 'primary';
  borderWidth?: number;
  containerProps?: ViewProps;
}

export function Avatar({
  source,
  size: sizeProp = 'md',
  border = 'primary',
  borderWidth = 2,
  containerProps,
  ...imageProps
}: AvatarProps) {
  const { theme } = useTheme();

  const size = typeof sizeProp === 'number' ? sizeProp : SIZE_MAP[sizeProp];
  const hasBorder = border !== false;
  const inset = hasBorder ? borderWidth + Math.round(size * 0.08) : 0;
  const imgSize = size - inset * 2;

  const borderStyle =
    border === 'primary'
      ? {
          backgroundColor: theme.colors.backgroundSecondary,
          borderColor: theme.colors.primaryOpacity40,
        }
      : border === 'neutral'
        ? {
            backgroundColor: theme.colors.neutralSurfaceOpacity20,
            borderColor: theme.colors.neutralSurfaceOpacity40,
          }
        : null;

  return (
    <View
      {...containerProps}
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
        hasBorder ? { borderWidth } : null,
        borderStyle,
        containerProps?.style,
      ]}
    >
      <View
        style={[
          hasBorder
            ? {
                width: imgSize,
                height: imgSize,
                borderRadius: imgSize / 2,
              }
            : styles.fill,
          styles.imageFrame,
        ]}
      >
        <Image
          {...imageProps}
          source={source}
          style={[styles.image, imageProps.style]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  imageFrame: {
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
