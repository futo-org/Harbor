import { Text } from '@/src/common/components/primitives';
import { useWebHover } from '@/src/common/lib/useWebHover';
import {
  Atoms,
  type Theme,
  useTheme,
  withHexOpacity,
} from '@/src/common/theme';
import { Ionicons } from '@expo/vector-icons';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, View } from 'react-native';

export type PostToolbarProps = {
  onReply?: () => void;
  onLike?: () => void;
  onDislike?: () => void;
  liked?: boolean;
  disliked?: boolean;
  /** Optional style override applied to the toolbar container. */
  style?: StyleProp<ViewStyle>;
};

/**
 * The row of reply / vote actions underneath a post's body. Pure
 * presentation — takes callbacks for each action.
 */
export function PostToolbar({
  onReply,
  onLike,
  onDislike,
  liked = false,
  disliked = false,
  style,
}: PostToolbarProps) {
  const { theme } = useTheme();

  return (
    <View style={[Atoms.flex_row, Atoms.justify_between, style]}>
      <ActionButton
        icon="chatbubble-outline"
        onPress={onReply}
        color={theme.palette.neutral_500}
      />
      <ActionButton
        icon={disliked ? 'arrow-down' : 'arrow-down-outline'}
        onPress={onDislike}
        color={
          disliked ? theme.palette.negative_500 : theme.palette.neutral_500
        }
      />
      <ActionButton
        icon={liked ? 'arrow-up' : 'arrow-up-outline'}
        onPress={onLike}
        color={liked ? theme.palette.primary_500 : theme.palette.neutral_500}
      />
    </View>
  );
}

function actionIconHoverColor(iconColor: string, theme: Theme): string {
  if (iconColor === theme.palette.primary_500) {
    return theme.palette.primary_600;
  }
  if (iconColor === theme.palette.negative_500) {
    return theme.palette.negative_600;
  }
  return theme.palette.neutral_700;
}

function ActionButton({
  icon,
  count,
  onPress,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  count?: number;
  onPress?: () => void;
  color: string;
}) {
  const { theme } = useTheme();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();
  const resolvedIconColor = hovered
    ? actionIconHoverColor(color, theme)
    : color;

  const iconSurface: StyleProp<ViewStyle> = [
    Atoms.p_xs,
    Atoms.rounded_md,
    {
      backgroundColor: hovered
        ? withHexOpacity(theme.palette.neutral_500, '14')
        : 'transparent',
    },
  ];

  return (
    <Pressable
      style={[Atoms.flex_row, Atoms.items_center, { gap: 3, minHeight: 20 }]}
      onPress={onPress}
      disabled={!onPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
    >
      <View style={iconSurface}>
        <Ionicons name={icon} size={16} color={resolvedIconColor} />
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
