import {
  Pressable,
  PressableProps,
  StyleSheet,
  Animated,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Text, TextVariant } from './Text';
import { useLegacyTheme, ColorToken, FontWeightToken } from '@/legacyTheme';
import { usePressAnimation } from '@/lib/animation';

type IconRenderFn = (props: { size: number; color: string }) => React.ReactNode;

interface LinkButtonProps extends Omit<PressableProps, 'style'> {
  onPress: () => void;
  title: string;
  color?: ColorToken;
  icon?: IconRenderFn;
  style?: StyleProp<ViewStyle>;
  variant?: TextVariant;
  fontWeight?: FontWeightToken;
  italic?: boolean;
}

export function LinkButton({
  onPress,
  title,
  color = 'primary',
  icon,
  style,
  variant = 'body',
  fontWeight = 'semibold',
  italic,
  ...props
}: LinkButtonProps) {
  const { legacyTheme } = useLegacyTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation();

  const textColor = legacyTheme.colors[color];

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
