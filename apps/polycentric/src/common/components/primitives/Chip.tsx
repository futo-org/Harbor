import { Pressable, StyleSheet, Animated, View } from 'react-native';
import { Text } from './Text';
import {
  useTheme,
  withHexOpacity,
  BorderRadius,
  typography,
  type BorderRadiusToken,
  type PaletteColorToken,
  type FontWeightToken,
} from '@/src/common/theme';
import { usePressAnimation } from '@/src/common/lib/animation';

type ChipSize = 'sm' | 'md' | 'lg';

type IconRenderFn = (props: { size: number; color: string }) => React.ReactNode;

interface ChipProps {
  title: string;
  size?: ChipSize;
  leftIcon?: IconRenderFn;
  rightIcon?: IconRenderFn;
  fontWeight?: FontWeightToken;
  isPressable?: boolean;
  onPress?: () => void;
  /** Resolved `#RRGGBB` or `#RRGGBBAA` (e.g. from `withHexOpacity`). */
  backgroundColor?: string;
  borderColor?: string;
  textColor?: PaletteColorToken;
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
    paddingH: 6,
    iconSize: 12,
    fontSize: 'xs',
    borderRadius: 'sm',
  },
  md: {
    paddingV: 6,
    paddingH: 6,
    iconSize: 14,
    fontSize: 'sm',
    borderRadius: 'md',
  },
  lg: {
    paddingV: 6,
    paddingH: 18,
    iconSize: 16,
    fontSize: 'md',
    borderRadius: 'md',
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
  borderColor: borderColorProp,
  textColor = 'neutral_1000',
}: ChipProps) {
  const { theme } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation();

  const sizeConfig = SIZE_CONFIG[size];
  const resolvedFontWeight = fontWeight || FONT_WEIGHT_MAP[size];
  const resolvedTextColor = theme.palette[textColor];
  const backgroundColor =
    backgroundColorProp ?? withHexOpacity(theme.palette.neutral_500, '20');
  const borderColor =
    borderColorProp ?? withHexOpacity(theme.palette.neutral_500, '40');

  const containerStyle = [
    styles.base,
    {
      paddingVertical: sizeConfig.paddingV,
      paddingHorizontal: sizeConfig.paddingH,
      backgroundColor,
      borderColor,
      borderRadius: BorderRadius[sizeConfig.borderRadius],
    },
  ];

  const content = (
    <>
      {leftIcon &&
        leftIcon({ size: sizeConfig.iconSize, color: resolvedTextColor })}
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
        rightIcon({ size: sizeConfig.iconSize, color: resolvedTextColor })}
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
