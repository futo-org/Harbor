import { usePressAnimation } from '@/src/common/lib/animation';
import { useWebHover } from '@/src/common/lib/useWebHover';
import {
  BorderRadius,
  useTheme,
  type BorderRadiusToken,
  type TextColor,
} from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { type IconName, type IconRenderFn, renderIcon } from '../Icon';
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

interface IconButtonProps {
  icon: IconName | IconRenderFn;
  onPress: () => void;
  disabled?: boolean;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  iconColor?: TextColor;
  borderRadius?: BorderRadiusToken;
  style?: StyleProp<ViewStyle>;
  /** Remove container padding (ghost variant only) */
  compact?: boolean;
  accessibilityLabel?: string;
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
  iconColor = 'primary',
  borderRadius,
  style,
  compact = false,
  ...props
}: IconButtonProps) {
  const { theme } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  const sizeConfig = SIZE_CONFIG[size];
  const resolvedBorderRadius = borderRadius
    ? BorderRadius[borderRadius]
    : sizeConfig.containerSize / 2;

  const iconElement = renderIcon(icon, {
    size: sizeConfig.iconSize,
    color: iconColor,
  });

  const { box } = theme.atoms_new;
  const showChrome = !(variant === 'ghost' && compact);
  const surfaceFill =
    variant === 'ghost'
      ? hovered && box.neutral.bg_subtle
      : hovered
        ? box.neutral.bg_subtle_hover
        : box.neutral.bg_subtle;

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
          hovered && theme.atoms_new.faded_subtle,
        ]}
        {...props}
      >
        {showChrome ? (
          <View
            style={[
              styles.surface,
              box.neutral.border_subtle,
              { borderWidth: 1, borderRadius: resolvedBorderRadius },
              surfaceFill,
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
