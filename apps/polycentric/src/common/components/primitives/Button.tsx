import { usePressAnimation } from '@/src/common/lib/animation';
import { useWebHover } from '@/src/common/lib/useWebHover';
import {
  Atoms,
  BorderRadius,
  Spacing,
  useTheme,
  withHexOpacity,
  type BorderRadiusToken,
  type FontWeightToken,
  type PaletteColorToken,
  type Theme,
} from '@/src/common/theme';
import {
  Animated,
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { Text } from './Text';
import Icon, { IconName } from '../Icon';

type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';

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
  style?: PressableProps['style'];
  icon?: IconRenderFn | IconName;
  fullWidth?: boolean;
  disabled?: boolean;
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
  sm: {
    paddingV: 4,
    paddingH: Spacing['md'],
    iconSize: 16,
    borderRadius: 'full',
  },
  md: {
    paddingV: 12,
    paddingH: Spacing['xl'],
    iconSize: 20,
    borderRadius: 'full',
  },
  lg: { paddingV: 18, paddingH: 24, iconSize: 24, borderRadius: 'full' },
};

export function Button({
  onPress,
  title,
  variant = 'primary',
  size = 'md',
  style,
  icon,
  fullWidth = false,
  disabled,
  ...props
}: ButtonProps) {
  const { theme } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  const sizeConfig = SIZE_CONFIG[size];
  const borderRadius = BorderRadius[sizeConfig.borderRadius];
  const iconOnly = !!icon && !title;
  const paddingHorizontal = iconOnly
    ? sizeConfig.paddingV
    : sizeConfig.paddingH;
  const isDisabled = !!disabled;
  const iconColor = isDisabled
    ? withHexOpacity(theme.palette.neutral_500, '80')
    : theme.palette[textColorMap[variant]];
  const surfaceStyle = isDisabled
    ? getDisabledSurfaceStyle(theme)
    : getVariantStyle(theme, variant);
  const hoverStyle =
    !isDisabled && hovered ? getHoverVariantStyle(theme, variant) : undefined;

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={isDisabled ? undefined : onPress}
        onPressIn={isDisabled ? undefined : onPressIn}
        onPressOut={isDisabled ? undefined : onPressOut}
        onHoverIn={isDisabled ? undefined : onHoverIn}
        onHoverOut={isDisabled ? undefined : onHoverOut}
        disabled={isDisabled}
        hitSlop={8}
        style={(state) => [
          styles.base,
          fullWidth && Atoms.w_full,
          !fullWidth && styles.fitContent,
          {
            paddingVertical: sizeConfig.paddingV,
            paddingHorizontal,
            borderRadius,
          },
          surfaceStyle,
          hoverStyle,
          typeof style === 'function' ? style(state) : style,
        ]}
        {...props}
      >
        <View style={[styles.content]}>
          {icon &&
            (typeof icon === 'function' ? (
              icon({ size: sizeConfig.iconSize, color: iconColor })
            ) : (
              <Icon name={icon} size={sizeConfig.iconSize} color={iconColor} />
            ))}
          {!iconOnly && (
            <Text
              fontSize={size}
              fontWeight={FONT_WEIGHT}
              color={isDisabled ? 'neutral_1000' : textColorMap[variant]}
              style={
                isDisabled
                  ? { color: withHexOpacity(theme.palette.neutral_500, '80') }
                  : undefined
              }
              numberOfLines={1}
            >
              {title}
            </Text>
          )}
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

const textColorMap: Record<ButtonVariant, PaletteColorToken> = {
  primary: 'white',
  secondary: 'primary_600',
  tertiary: 'neutral_1000',
  destructive: 'negative_500',
};

const FONT_WEIGHT: FontWeightToken = 'semibold';

function getVariantStyle(theme: Theme, variant: ButtonVariant) {
  switch (variant) {
    case 'primary':
      return {
        backgroundColor: theme.palette.primary_500,
        borderColor: theme.palette.primary_500,
        shadowColor: theme.palette.primary_900,
        shadowOpacity: 0.22,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        elevation: Platform.OS === 'android' ? 4 : 0,
      };
    case 'secondary':
      return {
        backgroundColor: withHexOpacity(theme.palette.primary_500, '20'),
        borderColor: withHexOpacity(theme.palette.primary_500, '40'),
      };
    case 'tertiary':
      return {
        backgroundColor: 'transparent',
        borderColor: withHexOpacity(theme.palette.neutral_500, '60'),
      };
    case 'destructive':
      return {
        backgroundColor: withHexOpacity(theme.palette.negative_500, '15'),
        borderColor: withHexOpacity(theme.palette.negative_500, '80'),
      };
  }
}

function getHoverVariantStyle(theme: Theme, variant: ButtonVariant): ViewStyle {
  switch (variant) {
    case 'primary':
      return {
        backgroundColor: theme.palette.primary_600,
        borderColor: theme.palette.primary_700,
      };
    case 'secondary':
      return {
        backgroundColor: withHexOpacity(theme.palette.primary_500, '32'),
        borderColor: withHexOpacity(theme.palette.primary_500, '55'),
      };
    case 'tertiary':
      return {
        backgroundColor: withHexOpacity(theme.palette.neutral_500, '14'),
        borderColor: withHexOpacity(theme.palette.neutral_500, '78'),
      };
    case 'destructive':
      return {
        backgroundColor: withHexOpacity(theme.palette.negative_500, '26'),
        borderColor: withHexOpacity(theme.palette.negative_500, 'A0'),
      };
  }
}

function getDisabledSurfaceStyle(theme: Theme): ViewStyle {
  return {
    backgroundColor: withHexOpacity(theme.palette.neutral_500, '10'),
    borderColor: withHexOpacity(theme.palette.neutral_500, '20'),
  };
}
