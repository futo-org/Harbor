import { Pressable, Animated } from 'react-native';
import { Box } from '@/src/common/components/layouts';
import {
  Atoms,
  Spacing,
  useTheme,
  withHexOpacity,
  type SpacingToken,
} from '@/src/common/theme';
import { usePressAnimation } from '@/src/common/lib/animation';

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

  const content = (
    <Box
      style={[
        Atoms.rounded_md,
        {
          paddingVertical: Spacing[marginVertical],
          paddingHorizontal: Spacing[marginHorizontal],
          backgroundColor: withHexOpacity(theme.palette.neutral_500, '20'),
        },
      ]}
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
