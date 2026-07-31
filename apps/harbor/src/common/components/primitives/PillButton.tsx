import {
  Pressable,
  type PressableProps,
  StyleSheet,
  Animated,
} from 'react-native';
import { Text } from './Text';
import {
  useTheme,
  withHexOpacity,
  type PaletteColorToken,
  type FontWeightToken,
} from '@/src/common/theme';
import { usePressAnimation } from '@/src/common/lib/animation';

type SmallButtonVariant = 'primary' | 'secondary' | 'destructive';

type IconRenderFn = (props: { size: number; color: string }) => React.ReactNode;

interface SmallButtonProps extends Omit<PressableProps, 'style'> {
  onPress: () => void;
  title: string;
  variant?: SmallButtonVariant;
  icon?: IconRenderFn;
}

const textColorMap: Record<SmallButtonVariant, PaletteColorToken> = {
  primary: 'white',
  secondary: 'primary_600',
  destructive: 'negative_500',
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

  const textColor = theme.palette[textColorMap[variant]];

  const variantStyle = (() => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: withHexOpacity(theme.palette.neutral_500, '20'),
        };
      case 'secondary':
        return {
          backgroundColor: withHexOpacity(theme.palette.primary_500, '20'),
        };
      case 'destructive':
        return {
          backgroundColor: withHexOpacity(theme.palette.negative_500, '20'),
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
