import { usePressAnimation } from '@/src/common/lib/animation';
import { useWebHover } from '@/src/common/lib/useWebHover';
import {
  Atoms,
  Spacing,
  useTheme,
  withHexOpacity,
  type SpacingToken,
} from '@/src/common/theme';
import { Animated, Pressable, View } from 'react-native';

interface ListItemProps {
  children?: React.ReactNode;
  pressable?: boolean;
  marginHorizontal?: SpacingToken;
  marginVertical?: SpacingToken;
  onPress?: () => void | Promise<void>;
}

export function ListItem({
  children,
  pressable = true,
  marginHorizontal = 'md',
  marginVertical = 'lg',
  onPress,
  ...props
}: ListItemProps) {
  const { theme } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  const padding = {
    paddingVertical: Spacing[marginVertical],
    paddingHorizontal: Spacing[marginHorizontal],
  };

  if (!pressable) {
    return (
      <View
        style={[
          Atoms.rounded_md,
          {
            ...padding,
            backgroundColor: withHexOpacity(theme.palette.neutral_500, '20'),
          },
        ]}
        {...props}
      >
        {children}
      </View>
    );
  }

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        hitSlop={8}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onHoverIn={onHoverIn}
        onHoverOut={onHoverOut}
        style={[
          Atoms.rounded_md,
          {
            ...padding,
            backgroundColor: withHexOpacity(
              theme.palette.neutral_500,
              hovered ? '35' : '20',
            ),
          },
        ]}
      >
        <View {...props}>{children}</View>
      </Pressable>
    </Animated.View>
  );
}
