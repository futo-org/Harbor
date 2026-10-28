import { Text } from '@/src/common/components';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';
import { Atoms, useTheme } from '@/src/common/theme';
import { Post } from '@/src/features/post/Post';
import { usePostById } from '@/src/features/post/hooks/usePostById';
import type { v2 } from '@polycentric/react-native';
import { ActivityIndicator, View } from 'react-native';

export function useModeratedPost(target: v2.EventKey | undefined) {
  return usePostById(
    target?.identity,
    getKeyFingerprint(target?.signedBy),
    target?.sequence,
  );
}

export function ModeratedPost({
  post,
  isLoading,
}: {
  post: PostData | null;
  isLoading: boolean;
}) {
  const { theme } = useTheme();

  if (isLoading) {
    return (
      <ActivityIndicator
        size="small"
        color={theme.palette.primary_500}
        style={Atoms.p_lg}
      />
    );
  }
  if (!post) {
    return (
      <View style={[Atoms.px_md, Atoms.py_sm]}>
        <Text variant="secondary" color="neutral_500">
          Post unavailable. It may have been deleted or is not on this server.
        </Text>
      </View>
    );
  }
  return <Post post={post} hideBottomBorder compactLinkPreview />;
}
