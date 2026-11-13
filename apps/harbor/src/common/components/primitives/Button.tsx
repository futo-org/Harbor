import { usePressAnimation } from '@/src/common/lib/animation';
import { useWebHover } from '@/src/common/lib/useWebHover';
import {
  Atoms,
  BorderRadius,
  Spacing,
  useTheme,
  type BorderRadiusToken,
  type FontWeightToken,
  type TextColor,
  type Theme,
} from '@/src/common/theme';
import { type Href, Link, router } from 'expo-router';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { Text } from './Text';
import Icon, { type IconName, type IconRenderFn } from '../Icon';

type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';

type ButtonSize = 'sm' | 'md' | 'lg';

// `href` is redeclared as an expo-router Href; RNW types it as a string.
interface ButtonProps extends Omit<PressableProps, 'style' | 'href'> {
  onPress?: () => void;
  /** Renders the button as a link, so it can be opened in a new tab. */
  href?: Href;
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
  href,
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
  const textColor = isDisabled ? 'muted' : textColorMap[variant];
  const hoverStyle =
    !isDisabled && hovered ? getHoverVariantStyle(theme, variant) : undefined;

  // Anchor for new-tab support; the click still routes in-app.
  const linkHref = href && !isDisabled ? Link.resolveHref(href) : undefined;
  const handlePress = (event?: { preventDefault?: () => void }) => {
    onPress?.();
    if (!href) return;
    event?.preventDefault?.();
    router.navigate(href);
  };

  const pressable = (
    <Pressable
      href={linkHref}
      onPress={isDisabled ? undefined : handlePress}
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
        isDisabled
          ? [
              theme.atoms_new.box.neutral.bg_subtle,
              theme.atoms_new.box.neutral.border_subtle,
              theme.atoms_new.faded,
            ]
          : getVariantStyle(theme, variant),
        hoverStyle,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      <View style={[styles.content, iconOnly && styles.iconOnlyContent]}>
        {icon &&
          (typeof icon === 'function' ? (
            icon({ size: sizeConfig.iconSize, color: textColor })
          ) : (
            <Icon name={icon} size={sizeConfig.iconSize} color={textColor} />
          ))}
        {!iconOnly && (
          <Text
            fontSize={size}
            fontWeight={FONT_WEIGHT}
            color={textColor}
            numberOfLines={1}
          >
            {title}
          </Text>
        )}
      </View>
    </Pressable>
  );

  return <Animated.View style={animatedStyle}>{pressable}</Animated.View>;
}

const BORDER_WIDTH = 1;

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
  iconOnlyContent: {
    aspectRatio: 1,
  },
});

const textColorMap: Record<ButtonVariant, TextColor> = {
  primary: 'light',
  secondary: 'accent',
  tertiary: 'primary',
  destructive: 'danger',
};

const FONT_WEIGHT: FontWeightToken = 'semibold';

function getVariantStyle(
  theme: Theme,
  variant: ButtonVariant,
): StyleProp<ViewStyle> {
  const { box, shadow, transparent } = theme.atoms_new;
  switch (variant) {
    case 'primary':
      return [box.accent.bg, box.accent.border, shadow.accent];
    case 'secondary':
      return [box.accent.bg_subtle, box.accent.border_subtle];
    case 'tertiary':
      return [transparent.bg, box.neutral.border_subtle];
    case 'destructive':
      return [box.danger.bg_subtle, box.danger.border_subtle];
  }
}

function getHoverVariantStyle(
  theme: Theme,
  variant: ButtonVariant,
): StyleProp<ViewStyle> {
  const { box } = theme.atoms_new;
  switch (variant) {
    case 'primary':
      return box.accent.bg_hover;
    case 'secondary':
      return box.accent.bg_subtle_hover;
    case 'tertiary':
      return box.neutral.bg_subtle;
    case 'destructive':
      return box.danger.bg_subtle_hover;
  }
}
