import { Pressable, StyleSheet, Animated, View } from 'react-native';
import { Text } from './Text';
import {
  useLegacyTheme,
  BorderRadiusToken,
  ColorToken,
  FontWeightToken,
} from '@/legacyTheme';
import { usePressAnimation } from '@/lib/animation';

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
  backgroundColor?: ColorToken;
  borderColor?: ColorToken;
  textColor?: ColorToken;
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
  backgroundColor = 'neutralSurfaceOpacity20',
  borderColor = 'neutralSurfaceOpacity40',
  textColor = 'text',
}: ChipProps) {
  const { legacyTheme } = useLegacyTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation();

  const sizeConfig = SIZE_CONFIG[size];
  const resolvedFontWeight = fontWeight || FONT_WEIGHT_MAP[size];
  const resolvedTextColor = legacyTheme.colors[textColor];

  const containerStyle = [
    styles.base,
    {
      paddingVertical: sizeConfig.paddingV,
      paddingHorizontal: sizeConfig.paddingH,
      backgroundColor: legacyTheme.colors[backgroundColor],
      borderColor: legacyTheme.colors[borderColor],
      borderRadius: legacyTheme.borderRadius[sizeConfig.borderRadius],
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
          fontSize: legacyTheme.typography.fontSize[sizeConfig.fontSize],
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
