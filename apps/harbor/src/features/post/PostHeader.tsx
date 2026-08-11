import { Text } from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { useWebHover } from '@/src/common/lib/useWebHover';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import Icon from '@/src/common/components/Icon';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';

const LEFT_COL_FLEX_BASIS = 40;

export function PostHeader({
  repostedBy,
  showThreadLineAbove,
}: {
  repostedBy?: string;
  showThreadLineAbove: boolean;
}) {
  return (
    <View style={!showThreadLineAbove && Atoms.pt_md}>
      {showThreadLineAbove ? <ThreadHeader /> : null}
      {repostedBy ? <RepostHeader identity={repostedBy} /> : null}
    </View>
  );
}

function ThreadHeader() {
  const { theme } = useTheme();
  return (
    <View style={[Atoms.flex_row, Atoms.gap_md]}>
      <View
        style={[
          Atoms.align_center,
          Atoms.mb_xs,
          { flexBasis: LEFT_COL_FLEX_BASIS },
        ]}
      >
        <View
          style={[
            Atoms.flex_1,
            {
              width: 2,
              backgroundColor: withHexOpacity(theme.palette.neutral_500, '30'),
            },
          ]}
        />
      </View>
      <View style={[Atoms.flex_1, Atoms.pt_md]} />
    </View>
  );
}

function RepostHeader({ identity }: { identity: string }) {
  const profile = useProfile(identity);
  const name = profile.name ?? '';

  const handlePress = useCallback(() => {
    router.push(Routes.tabs.profile(identity));
  }, [identity]);

  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  return (
    <Pressable
      onPress={handlePress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      style={[
        Atoms.flex_row,
        Atoms.gap_md,
        Atoms.align_center,
        { marginTop: -4, marginBottom: 4 },
      ]}
    >
      <View style={[Atoms.items_end, { flexBasis: LEFT_COL_FLEX_BASIS }]}>
        <Icon size={16} name="repost" color="neutral_500" />
      </View>
      <View style={[Atoms.flex_row, Atoms.flex_shrink_1]}>
        <Text
          variant="small"
          color="neutral_500"
          fontWeight="bold"
          numberOfLines={1}
          style={[Atoms.flex_shrink_1, hovered && Atoms.text_underline]}
        >
          {name || '…'}
        </Text>
        <Text
          variant="small"
          color="neutral_500"
          fontWeight="bold"
          style={hovered && Atoms.text_underline}
        >
          {' reposted'}
        </Text>
      </View>
    </Pressable>
  );
}
