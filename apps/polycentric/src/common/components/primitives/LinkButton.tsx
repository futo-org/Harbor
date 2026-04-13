import { usePressAnimation } from '@/src/common/lib/animation';
import { useWebHover } from '@/src/common/lib/useWebHover';
import {
  Atoms,
  useTheme,
  type FontWeightToken,
  type PaletteColorToken,
} from '@/src/common/theme';
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Text, TextVariant } from './Text';

type IconRenderFn = (props: { size: number; color: string }) => React.ReactNode;

interface LinkButtonProps extends Omit<PressableProps, 'style'> {
  onPress: () => void;
  title: string;
  color?: PaletteColorToken;
  icon?: IconRenderFn;
  style?: StyleProp<ViewStyle>;
  variant?: TextVariant;
  fontWeight?: FontWeightToken;
  italic?: boolean;
  underlineOnHover?: boolean;
}

export function LinkButton({
  onPress,
  title,
  color = 'primary_500',
  icon,
  style,
  variant = 'body',
  fontWeight = 'semibold',
  italic,
  underlineOnHover = false,
  disabled,
  ...props
}: LinkButtonProps) {
  const { theme } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  const textColor = theme.palette[color];

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onHoverIn={onHoverIn}
        onHoverOut={onHoverOut}
        disabled={disabled}
        style={[
          Atoms.flex_row,
          Atoms.items_center,
          Atoms.justify_center,
          Atoms.gap_xs,
          style,
        ]}
        hitSlop={8}
        {...props}
      >
        {icon && icon({ size: 14, color: textColor })}
        <Text
          variant={variant}
          fontWeight={fontWeight}
          color={color}
          italic={italic}
          style={
            hovered && underlineOnHover && !disabled
              ? { textDecorationLine: 'underline' }
              : undefined
          }
        >
          {title}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
