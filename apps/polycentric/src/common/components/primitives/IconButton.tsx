import { usePressAnimation } from '@/src/common/lib/animation';
import { useWebHover } from '@/src/common/lib/useWebHover';
import {
  BorderRadius,
  useTheme,
  withHexOpacity,
  type BorderRadiusToken,
  type PaletteColorToken,
} from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import {
  Animated,
  Pressable,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

type IconButtonSize = 'sm' | 'md' | 'lg';
type IconButtonVariant = 'filled' | 'ghost';

type IconRenderFn = (props: { size: number; color: string }) => React.ReactNode;

interface IconButtonProps {
  icon: IconRenderFn;
  onPress: () => void;
  disabled?: boolean;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  iconColor?: PaletteColorToken;
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
  disabled = false,
  size = 'md',
  variant = 'filled',
  iconColor = 'neutral_1000',
  borderRadius,
  style,
  compact = false,
  ...props
}: IconButtonProps) {
  const { theme } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  const sizeConfig = SIZE_CONFIG[size];
  const resolvedIconColor = theme.palette[iconColor];
  const resolvedBorderRadius = borderRadius
    ? BorderRadius[borderRadius]
    : sizeConfig.containerSize / 2;

  const iconElement = icon({
    size: sizeConfig.iconSize,
    color: resolvedIconColor,
  });

  const ghostFill = withHexOpacity(
    theme.palette.neutral_500,
    hovered ? '22' : '00',
  );
  const filledFill = withHexOpacity(
    theme.palette.neutral_500,
    hovered ? '22' : '10',
  );

  const chromeBorder = {
    borderWidth: 1,
    borderColor: withHexOpacity(theme.palette.neutral_500, '20'),
  };

  const showChrome = !(variant === 'ghost' && compact);
  const surfaceBg = variant === 'ghost' ? ghostFill : filledFill;

  return (
    <Animated.View pointerEvents="box-none" style={[animatedStyle, style]}>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onPressIn={disabled ? undefined : onPressIn}
        onPressOut={disabled ? undefined : onPressOut}
        onHoverIn={disabled ? undefined : onHoverIn}
        onHoverOut={disabled ? undefined : onHoverOut}
        style={[
          styles.hitArea,
          {
            width: sizeConfig.containerSize,
            height: sizeConfig.containerSize,
            borderRadius: resolvedBorderRadius,
            ...(isWeb
              ? ({ cursor: disabled ? 'default' : 'pointer' } as ViewStyle)
              : {}),
          },
          hovered && { opacity: 0.8 },
        ]}
        {...props}
      >
        {showChrome ? (
          <View
            style={[
              styles.surface,
              chromeBorder,
              {
                borderRadius: resolvedBorderRadius,
                backgroundColor: surfaceBg,
              },
            ]}
          >
            {iconElement}
          </View>
        ) : (
          iconElement
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hitArea: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  surface: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
