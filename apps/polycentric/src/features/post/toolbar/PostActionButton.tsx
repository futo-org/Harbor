import { Text } from '@/src/common/components';
import { useWebHover } from '@/src/common/lib/useWebHover';
import {
  Atoms,
  PaletteColorToken,
  useTheme,
  withHexOpacity,
} from '@/src/common/theme';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';

type PostActionButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  count?: number;
  onPress?: () => void;
  active?: boolean;
  color?: PaletteColorToken;
};

export default function PostActionButton({
  icon,
  count,
  onPress,
  active = false,
  color = 'neutral_500',
}: PostActionButtonProps) {
  const { theme } = useTheme();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  const iconSurface: StyleProp<ViewStyle> = [
    Atoms.p_xs,
    Atoms.rounded_full,
    {
      backgroundColor: hovered
        ? withHexOpacity(theme.palette[color], '14')
        : active
          ? withHexOpacity(theme.palette[color], '28')
          : 'transparent',
    },
  ];

  return (
    <Pressable
      style={[
        Atoms.flex_1,
        Atoms.flex_row,
        Atoms.items_center,
        { gap: 3, minHeight: 20 },
      ]}
      onPress={onPress}
      disabled={!onPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
    >
      <View style={iconSurface}>
        <Ionicons
          name={icon}
          size={16}
          color={
            active || hovered ? theme.palette[color] : theme.palette.neutral_500
          }
        />
      </View>
      {count !== undefined ? (
        <Text
          variant="small"
          color="neutral_500"
          style={{ minWidth: 28, lineHeight: 16 }}
        >
          {count ? String(count) : ' '}
        </Text>
      ) : null}
    </Pressable>
  );
}
