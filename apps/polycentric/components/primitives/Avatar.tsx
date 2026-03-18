import {
  Image,
  ImageProps,
  ImageSourcePropType,
  StyleSheet,
  View,
  ViewProps,
} from 'react-native';
import {
  LinearGradient,
  Circle,
  Canvas,
  Rect,
  Group,
  Mask,
  vec,
} from '@shopify/react-native-skia';
import { useTheme } from '@/theme';
import { Images } from '@/assets';

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
  const inset = borderWidth + Math.round(size * 0.08);
  const imgSize = size - inset * 2;
  const center = size / 2;
  const innerRadius = imgSize / 2;

  const renderBorder = () => {
    if (!border) return null;

    const fill =
      border === 'primary' ? (
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, size)}
          colors={[
            theme.colors.backgroundPrimary,
            theme.colors.backgroundSecondary,
          ]}
        />
      ) : null;

    const color =
      border === 'neutral' ? theme.colors.neutralSurface : undefined;

    return (
      <Canvas style={StyleSheet.absoluteFill}>
        <Mask
          mask={
            <Group>
              <Rect x={0} y={0} width={size} height={size} color="white" />
              <Circle cx={center} cy={center} r={innerRadius} color="black" />
            </Group>
          }
        >
          <Circle cx={center} cy={center} r={size / 2} color={color}>
            {fill}
          </Circle>
        </Mask>
      </Canvas>
    );
  };

  return (
    <View
      {...containerProps}
      style={[
        styles.avatarCanvas,
        { width: size, height: size, borderRadius: size / 2 },
        containerProps?.style,
      ]}
    >
      {renderBorder()}
      <Image
        {...imageProps}
        source={source}
        style={[
          styles.avatarImage,
          border
            ? {
                width: imgSize,
                height: imgSize,
                top: inset,
                left: inset,
              }
            : { width: size, height: size, borderRadius: size / 2 },
          imageProps.style,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  avatarCanvas: {
    overflow: 'hidden',
  },
  avatarImage: {
    position: 'absolute',
  },
});
