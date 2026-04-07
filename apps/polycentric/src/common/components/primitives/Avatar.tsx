import {
  Image,
  ImageProps,
  ImageSourcePropType,
  StyleSheet,
  View,
  ViewProps,
} from 'react-native';
import { useTheme, withHexOpacity } from '@/src/common/theme';

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
}

export function Avatar({
  source,
  size: sizeProp = 'md',
  border = true,
  borderWidth = 1,
  containerProps,
  resizeMode = 'cover',
  ...imageProps
}: AvatarProps) {
  const { theme } = useTheme();
  const { style: imageStyle, ...restImageProps } = imageProps;

  const size = typeof sizeProp === 'number' ? sizeProp : SIZE_MAP[sizeProp];
  const hasBorder = border;

  return (
    <View
      {...containerProps}
      style={[
        styles.clip,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.palette.background_primary,
        },
        hasBorder && {
          borderWidth,
          borderColor: withHexOpacity(theme.palette.neutral_500, '80'),
        },
        containerProps?.style,
      ]}
    >
      <Image
        {...restImageProps}
        source={source}
        resizeMode={resizeMode}
        style={[styles.image, imageStyle]}
      />
    </View>
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
});
