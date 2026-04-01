import {
  Pressable,
  StyleSheet,
  Animated,
  View,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useLegacyTheme, ColorToken, BorderRadiusToken } from '@/legacyTheme';
import { usePressAnimation } from '@/lib/animation';

type IconButtonSize = 'sm' | 'md' | 'lg';
type IconButtonVariant = 'filled' | 'ghost';

type IconRenderFn = (props: { size: number; color: string }) => React.ReactNode;

interface IconButtonProps {
  icon: IconRenderFn;
  onPress: () => void;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  iconColor?: ColorToken;
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
  iconColor = 'text',
  blurIntensity = 80,
  borderRadius,
  style,
  compact = false,
  ...props
}: IconButtonProps) {
  const { legacyTheme, legacyIsDark } = useLegacyTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation();

  const sizeConfig = SIZE_CONFIG[size];
  const resolvedIconColor = legacyTheme.colors[iconColor];
  const resolvedBorderRadius = borderRadius
    ? legacyTheme.borderRadius[borderRadius]
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
            tint={legacyIsDark ? 'dark' : 'light'}
            style={[
              styles.container,
              {
                width: sizeConfig.containerSize,
                height: sizeConfig.containerSize,
                borderRadius: resolvedBorderRadius,
                backgroundColor: legacyTheme.colors.neutralSurfaceOpacity10,
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
