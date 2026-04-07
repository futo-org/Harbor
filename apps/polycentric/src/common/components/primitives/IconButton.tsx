import {
  Pressable,
  StyleSheet,
  Animated,
  View,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import {
  useTheme,
  withHexOpacity,
  BorderRadius,
  type PaletteColorToken,
  type BorderRadiusToken,
} from '@/src/common/theme';
import { usePressAnimation } from '@/src/common/lib/animation';

type IconButtonSize = 'sm' | 'md' | 'lg';
type IconButtonVariant = 'filled' | 'ghost';

type IconRenderFn = (props: { size: number; color: string }) => React.ReactNode;

interface IconButtonProps {
  icon: IconRenderFn;
  onPress: () => void;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  iconColor?: PaletteColorToken;
  blurIntensity?: number;
  borderRadius?: BorderRadiusToken;
  style?: StyleProp<ViewStyle>;
  /** Remove container padding (ghost variant only) */
  compact?: boolean;
}

const SIZE_CONFIG: Record<
  IconButtonSize,
  { containerSize: number; iconSize: number }
> = {
  sm: { containerSize: 32, iconSize: 16 },
  md: { containerSize: 40, iconSize: 22 },
  lg: { containerSize: 48, iconSize: 26 },
};

export function IconButton({
  icon,
  onPress,
  size = 'md',
  variant = 'filled',
  iconColor = 'neutral_1000',
  blurIntensity = 80,
  borderRadius,
  style,
  compact = false,
  ...props
}: IconButtonProps) {
  const { theme } = useTheme();
  const isDark = theme.scheme === 'dark';
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation();

  const sizeConfig = SIZE_CONFIG[size];
  const resolvedIconColor = theme.palette[iconColor];
  const resolvedBorderRadius = borderRadius
    ? BorderRadius[borderRadius]
    : sizeConfig.containerSize / 2;

  const iconElement = icon({
    size: sizeConfig.iconSize,
    color: resolvedIconColor,
  });

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        hitSlop={8}
        style={style}
        {...props}
      >
        {variant === 'ghost' ? (
          compact ? (
            iconElement
          ) : (
            <View
              style={[
                styles.container,
                {
                  width: sizeConfig.containerSize,
                  height: sizeConfig.containerSize,
                },
              ]}
            >
              {iconElement}
            </View>
          )
        ) : (
          <BlurView
            intensity={blurIntensity}
            tint={isDark ? 'dark' : 'light'}
            style={[
              styles.container,
              {
                width: sizeConfig.containerSize,
                height: sizeConfig.containerSize,
                borderRadius: resolvedBorderRadius,
                backgroundColor: withHexOpacity(
                  theme.palette.neutral_500,
                  '10',
                ),
              },
            ]}
          >
            {iconElement}
          </BlurView>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
