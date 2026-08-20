import { usePressAnimation } from '@/src/common/lib/animation';
import { useWebHover } from '@/src/common/lib/useWebHover';
import {
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
      <View style={padding} {...props}>
        {children}
      </View>
    );
  }

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onHoverIn={onHoverIn}
        onHoverOut={onHoverOut}
        style={{
          ...padding,
          // We assume that the container has drawn the background,
          // so we only handle tinting on hover.
          backgroundColor: hovered
            ? withHexOpacity(theme.palette.neutral_500, '20')
            : 'transparent',
        }}
      >
        <View {...props}>{children}</View>
      </Pressable>
    </Animated.View>
  );
}
