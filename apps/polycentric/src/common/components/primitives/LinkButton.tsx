import {
  Pressable,
  PressableProps,
  StyleSheet,
  Animated,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Text, TextVariant } from './Text';
import {
  useTheme,
  type PaletteColorToken,
  type FontWeightToken,
} from '@/src/common/theme';
import { usePressAnimation } from '@/src/common/lib/animation';

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
  ...props
}: LinkButtonProps) {
  const { theme } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation();

  const textColor = theme.palette[color];

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[styles.base, style]}
        hitSlop={8}
        {...props}
      >
        {icon && icon({ size: 14, color: textColor })}
        <Text
          variant={variant}
          fontWeight={fontWeight}
          color={color}
          italic={italic}
        >
          {title}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
});
