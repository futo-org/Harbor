import { Pressable, Animated } from 'react-native';
import { Box } from '@/components/layouts';
import { SpacingToken } from '@/legacyTheme';
import { usePressAnimation } from '@/lib/animation';

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
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation();

  const content = (
    <Box
      paddingVertical={marginVertical}
      paddingHorizontal={marginHorizontal}
      backgroundColor="neutralSurfaceOpacity20"
      borderRadius="md"
      {...props}
    >
      {children}
    </Box>
  );

  if (pressable) {
    return (
      <Animated.View style={animatedStyle}>
        <Pressable
          onPress={onPress}
          hitSlop={8}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
        >
          {content}
        </Pressable>
      </Animated.View>
    );
  }

  return content;
}
