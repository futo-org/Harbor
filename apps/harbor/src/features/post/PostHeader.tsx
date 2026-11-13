import { Text } from '@/src/common/components/primitives';
import { TimeAgo } from '@/src/common/components/TimeAgo';
import { Routes } from '@/src/common/constants';
import { useWebHover } from '@/src/common/lib/useWebHover';
import { Atoms, useTheme } from '@/src/common/theme';
import { Username } from '@/src/features/profile/Username';
import Icon from '@/src/common/components/Icon';
import { router } from 'expo-router';
import { memo, useCallback } from 'react';
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
            theme.atoms_new.box.neutral.border_subtle,
            { borderLeftWidth: 2 },
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
    router.navigate(Routes.tabs.profile(identity));
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
        <Icon size={16} name="repost" color="muted" />
      </View>
      <View style={[Atoms.flex_row, Atoms.align_center, Atoms.flex_shrink_1]}>
        <Username
          identity={identity}
          variant="small"
          color="muted"
          fontWeight="bold"
          style={hovered && Atoms.text_underline}
        />
        <Text
          variant="small"
          color="muted"
          fontWeight="bold"
          style={[Atoms.flex_shrink_0, hovered && Atoms.text_underline]}
        >
          {' reposted'}
          {repostedAt ? (
            <>
              {' · '}
              <TimeAgo since={repostedAt} />
            </>
          ) : null}
        </Text>
      </View>
    </Pressable>
  );
}
