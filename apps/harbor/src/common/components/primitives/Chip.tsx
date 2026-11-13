import { usePressAnimation } from '@/src/common/lib/animation';
import { useWebHover } from '@/src/common/lib/useWebHover';
import {
  BorderRadius,
  typography,
  useTheme,
  withHexOpacity,
  type BorderRadiusToken,
  type FontWeightToken,
  type TextColor,
} from '@/src/common/theme';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { type IconName, type IconRenderFn, renderIcon } from '../Icon';

type ChipSize = 'sm' | 'md' | 'lg';

interface ChipProps {
  title: string;
  size?: ChipSize;
  leftIcon?: IconName | IconRenderFn;
  rightIcon?: IconName | IconRenderFn;
  fontWeight?: FontWeightToken;
  isPressable?: boolean;
  onPress?: () => void;
  /** Resolved `#RRGGBB` or `#RRGGBBAA` (e.g. from `withHexOpacity`). */
  backgroundColor?: string;
  hoverBackgroundColor?: string;
  borderColor?: string;
  textColor?: TextColor;
}

const SIZE_CONFIG: Record<
  ChipSize,
  {
    paddingV: number;
    paddingH: number;
    iconSize: number;
    fontSize: 'xs' | 'sm' | 'md';
    borderRadius: BorderRadiusToken;
  }
> = {
  sm: {
    paddingV: 4,
    paddingH: 8,
    iconSize: 12,
    fontSize: 'xs',
    borderRadius: 'full',
  },
  md: {
    paddingV: 6,
    paddingH: 8,
    iconSize: 14,
    fontSize: 'sm',
    borderRadius: 'full',
  },
  lg: {
    paddingV: 6,
    paddingH: 18,
    iconSize: 16,
    fontSize: 'md',
    borderRadius: 'full',
  },
};

const FONT_WEIGHT_MAP: Record<ChipSize, FontWeightToken> = {
  sm: 'regular',
  md: 'semibold',
  lg: 'semibold',
};

export function Chip({
  title,
  size = 'md',
  leftIcon,
  rightIcon,
  fontWeight,
  isPressable = true,
  onPress,
  backgroundColor: backgroundColorProp,
  hoverBackgroundColor,
  borderColor: borderColorProp,
  textColor = 'primary',
}: ChipProps) {
  const { theme } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  const sizeConfig = SIZE_CONFIG[size];
  const resolvedFontWeight = fontWeight || FONT_WEIGHT_MAP[size];
  const backgroundColor =
    backgroundColorProp ?? withHexOpacity(theme.palette.neutral_500, '20');
  const borderColor =
    borderColorProp ?? withHexOpacity(theme.palette.neutral_500, '40');
  const resolvedBg =
    hovered && hoverBackgroundColor ? hoverBackgroundColor : backgroundColor;

  const containerStyle = [
    styles.base,
    {
      paddingVertical: sizeConfig.paddingV,
      paddingHorizontal: sizeConfig.paddingH,
      backgroundColor: resolvedBg,
      borderColor,
      borderRadius: BorderRadius[sizeConfig.borderRadius],
    },
  ];

  const content = (
    <>
      {leftIcon &&
        renderIcon(leftIcon, { size: sizeConfig.iconSize, color: textColor })}
      <Text
        variant="body"
        color={textColor}
        fontWeight={resolvedFontWeight}
        style={{
          fontSize: typography.fontSize[sizeConfig.fontSize],
        }}
      >
        {title}
      </Text>
      {rightIcon &&
        renderIcon(rightIcon, { size: sizeConfig.iconSize, color: textColor })}
    </>
  );

  if (!isPressable) {
    return <View style={containerStyle}>{content}</View>;
  }

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onHoverIn={onHoverIn}
        onHoverOut={onHoverOut}
        style={containerStyle}
      >
        {content}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    borderWidth: 1,
  },
});
