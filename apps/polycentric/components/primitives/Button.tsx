import {
  Pressable,
  PressableProps,
  StyleSheet,
  Animated,
  ViewStyle,
  StyleProp,
  View,
  Platform,
} from 'react-native';
import { Text } from './Text';
import {
  useLegacyTheme,
  FontWeightToken,
  BorderRadiusToken,
  ColorToken,
  LegacyTheme,
} from '@/legacyTheme';
import { usePressAnimation } from '@/lib/animation';

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'disabled'
  | 'destructive';

type ButtonSize = 'sm' | 'md' | 'lg';

type IconRenderFn = (props: {
  size: number;
  color: string;
  style?: object;
}) => React.ReactNode;

interface ButtonProps extends Omit<PressableProps, 'style'> {
  onPress: () => void;
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  style?: StyleProp<ViewStyle>;
  icon?: IconRenderFn;
  fullWidth?: boolean;
}

const SIZE_CONFIG: Record<
  ButtonSize,
  {
    paddingV: number;
    paddingH: number;
    iconSize: number;
    borderRadius: BorderRadiusToken;
  }
> = {
  sm: { paddingV: 4, paddingH: 6, iconSize: 16, borderRadius: 'sm' },
  md: { paddingV: 12, paddingH: 18, iconSize: 20, borderRadius: 'lg' },
  lg: { paddingV: 18, paddingH: 24, iconSize: 24, borderRadius: 'lg' },
};

export function Button({
  onPress,
  title,
  variant = 'primary',
  size = 'md',
  style,
  icon,
  fullWidth = false,
  ...props
}: ButtonProps) {
  const { legacyTheme } = useLegacyTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation();

  const sizeConfig = SIZE_CONFIG[size];
  const borderRadius = legacyTheme.borderRadius[sizeConfig.borderRadius];
  const isDisabled = variant === 'disabled';
  const iconColor = legacyTheme.colors[textColorMap[variant]];
  const variantStyle = getVariantStyle(legacyTheme, variant);

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={isDisabled ? undefined : onPress}
        onPressIn={isDisabled ? undefined : onPressIn}
        onPressOut={isDisabled ? undefined : onPressOut}
        hitSlop={8}
        style={[
          styles.base,
          !fullWidth && styles.fitContent,
          {
            paddingVertical: sizeConfig.paddingV,
            paddingHorizontal: sizeConfig.paddingH,
            borderRadius,
          },
          variantStyle,
          style,
        ]}
        {...props}
      >
        <View style={[styles.content, icon && title && { marginLeft: -3 }]}>
          {icon &&
            icon({
              size: sizeConfig.iconSize,
              color: iconColor,
            })}
          <Text
            fontWeight={FONT_WEIGHT}
            color={textColorMap[variant]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const BORDER_WIDTH = 1.5;

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: BORDER_WIDTH,
    borderColor: 'transparent',
  },
  fitContent: {
    alignSelf: 'flex-start',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});

const textColorMap: Record<ButtonVariant, ColorToken> = {
  primary: 'white',
  secondary: 'primary',
  tertiary: 'text',
  disabled: 'neutralSurfaceOpacity80',
  destructive: 'destructive',
};

const FONT_WEIGHT: FontWeightToken = 'semibold';

function getVariantStyle(legacyTheme: LegacyTheme, variant: ButtonVariant) {
  switch (variant) {
    case 'primary':
      return {
        backgroundColor: legacyTheme.colors.primary,
        borderColor: legacyTheme.colors.primaryDarker,
        shadowColor: legacyTheme.colors.primaryDarkest,
        shadowOpacity: 0.22,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        elevation: Platform.OS === 'android' ? 4 : 0,
      };
    case 'secondary':
      return {
        backgroundColor: legacyTheme.colors.primaryOpacity20,
        borderColor: legacyTheme.colors.primaryOpacity40,
      };
    case 'tertiary':
      return {
        backgroundColor: 'transparent',
        borderColor: legacyTheme.colors.neutralSurfaceOpacity60,
      };
    case 'disabled':
      return {
        backgroundColor: legacyTheme.colors.neutralSurfaceOpacity20,
        borderColor: legacyTheme.colors.neutralSurfaceOpacity40,
      };
    case 'destructive':
      return {
        backgroundColor: legacyTheme.colors.destructiveOpacity15,
        borderColor: legacyTheme.colors.destructiveOpacity80,
      };
  }
}
