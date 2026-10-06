import { Text } from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { timeAgo } from '@/src/common/lib/polycentric-hooks';
import { useWebHover } from '@/src/common/lib/useWebHover';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { Username } from '@/src/features/profile/Username';
import Icon from '@/src/common/components/Icon';
import { router } from 'expo-router';
import { memo, useCallback, useMemo } from 'react';
import { Pressable, View } from 'react-native';

const LEFT_COL_FLEX_BASIS = 40;

export const PostHeader = memo(function PostHeader({
  repostedBy,
  repostedAt,
  showThreadLineAbove,
}: {
  repostedBy?: string;
  repostedAt?: number;
  showThreadLineAbove: boolean;
}) {
  return (
    <View style={!showThreadLineAbove && Atoms.pt_md}>
      {showThreadLineAbove ? <ThreadHeader /> : null}
      {repostedBy ? (
        <RepostHeader identity={repostedBy} repostedAt={repostedAt} />
      ) : null}
    </View>
  );
});

function ThreadHeader() {
  const { theme } = useTheme();
  return (
    <View style={[Atoms.flex_row, Atoms.gap_md]}>
      <View style={[Atoms.align_center, { flexBasis: LEFT_COL_FLEX_BASIS }]}>
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

function RepostHeader({
  identity,
  repostedAt,
}: {
  identity: string;
  repostedAt?: number;
}) {
  const handlePress = useCallback(() => {
    router.push(Routes.tabs.profile(identity));
  }, [identity]);

  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  const time = useMemo(() => timeAgo(Number(repostedAt)), [repostedAt]);

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
      <View style={[Atoms.flex_row, Atoms.align_center, Atoms.flex_shrink_1]}>
        <Username
          identity={identity}
          variant="small"
          color="neutral_500"
          fontWeight="bold"
          style={hovered && Atoms.text_underline}
        />
        <Text
          variant="small"
          color="neutral_500"
          fontWeight="bold"
          style={[Atoms.flex_shrink_0, hovered && Atoms.text_underline]}
        >
          {time ? ` reposted · ${time}` : ' reposted'}
        </Text>
      </View>
    </Pressable>
  );
}
