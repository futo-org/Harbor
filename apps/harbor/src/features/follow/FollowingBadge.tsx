import Icon from '@/src/common/components/Icon';
import { Tooltip } from '@/src/common/components/Tooltip';
import { Atoms, useTheme } from '@/src/common/theme';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import useFollows from './hooks/useFollows';

export function FollowingBadge({
  identity,
  size,
  style,
}: {
  identity: string | null;
  /** Badge diameter in logical pixels. */
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const following = useFollows((state) =>
    identity ? state.isFollowing(identity) : false,
  );

  if (!following) return null;

  const glyphSize = Math.round(size * 0.7);

  return (
    <Tooltip text="Following" style={style}>
      <View
        style={[
          Atoms.align_center,
          Atoms.justify_center,
          Atoms.flex_shrink_0,
          Atoms.rounded_full,
          { width: size, height: size },
          // Match FollowButton's Following state
          theme.atoms_new.box.accent.bg,
        ]}
      >
        <Icon name="personCheck" size={glyphSize} color="light" />
      </View>
    </Tooltip>
  );
}
