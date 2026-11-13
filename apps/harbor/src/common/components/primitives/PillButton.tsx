import {
  Pressable,
  type PressableProps,
  StyleSheet,
  Animated,
} from 'react-native';
import { Text } from './Text';
import {
  useTheme,
  type TextColor,
  type FontWeightToken,
} from '@/src/common/theme';
import { usePressAnimation } from '@/src/common/lib/animation';
import { type IconName, type IconRenderFn, renderIcon } from '../Icon';

type SmallButtonVariant = 'primary' | 'secondary' | 'destructive';

interface SmallButtonProps extends Omit<PressableProps, 'style'> {
  onPress: () => void;
  title: string;
  variant?: SmallButtonVariant;
  icon?: IconName | IconRenderFn;
}

const textColorMap: Record<SmallButtonVariant, TextColor> = {
  primary: 'light',
  secondary: 'accent',
  destructive: 'danger',
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

  const variantStyle = (() => {
    switch (variant) {
      case 'primary':
        return theme.atoms_new.box.neutral.bg_subtle;
      case 'secondary':
        return theme.atoms_new.box.accent.bg_subtle;
      case 'destructive':
        return theme.atoms_new.box.danger.bg_subtle;
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
        {icon && renderIcon(icon, { size: 14, color: textColorMap[variant] })}
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
