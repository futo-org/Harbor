import { Pressable, PressableProps, StyleSheet, Animated } from 'react-native';
import { Text } from './Text';
import { useTheme, ColorToken, FontWeightToken } from '@/theme';
import { usePressAnimation } from '@/lib/animation';

type SmallButtonVariant = 'primary' | 'secondary' | 'destructive';

type IconRenderFn = (props: { size: number; color: string }) => React.ReactNode;

interface SmallButtonProps extends Omit<PressableProps, 'style'> {
  onPress: () => void;
  title: string;
  variant?: SmallButtonVariant;
  icon?: IconRenderFn;
}

const textColorMap: Record<SmallButtonVariant, ColorToken> = {
  primary: 'white',
  secondary: 'primary',
  destructive: 'destructive',
};

const FONT_WEIGHT: FontWeightToken = 'semibold';

export function PillButton({
  onPress,
  title,
  variant = 'primary',
  icon,
  ...props
}: SmallButtonProps) {
  const { theme } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation();

  const textColor = theme.colors[textColorMap[variant]];

  const variantStyle = (() => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: theme.colors.neutralSurfaceOpacity20,
        };
      case 'secondary':
        return {
          backgroundColor: theme.colors.primaryOpacity20,
        };
      case 'destructive':
        return {
          backgroundColor: theme.colors.destructiveOpacity20,
        };
    }
  })();

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[styles.base, variantStyle]}
        hitSlop={8}
        {...props}
      >
        {icon && icon({ size: 14, color: textColor })}
        <Text
          variant="secondary"
          fontWeight={FONT_WEIGHT}
          color={textColorMap[variant]}
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
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
});
