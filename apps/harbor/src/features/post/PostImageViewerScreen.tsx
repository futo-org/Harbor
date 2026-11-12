import { useLocalSearchParams } from 'expo-router';
import { ContentImageViewerScreen } from '@/src/common/components/ImageViewer';
import { Routes } from '@/src/common/constants/routes';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';
import { openWithReturn } from '@/src/common/lib/navigation/openWithReturn';
import { usePostById } from './hooks/usePostById';

/**
 * Full-screen viewer for one post's images, mounted by the
 * `/[identityId]/post/[keyFingerprint]/[sequence]/image/[index]` route as
 * a transparentModal over whatever screen pushed it (feed, profile, ...).
 * Loads the post from the URL params, so a refresh or shared link shows
 * the same image.
 */
export default function PostImageViewerScreen() {
  const {
    identityId,
    keyFingerprint,
    sequence = '',
  } = useLocalSearchParams<{
    identityId: string;
    keyFingerprint: string;
    sequence: string;
  }>();

  const { post, isLoading } = usePostById(
    identityId,
    keyFingerprint,
    BigInt(sequence),
  );

  return (
    <ContentImageViewerScreen
      images={post?.images}
      isLoading={isLoading}
      fallbackHref={Routes.tabs.post(identityId, keyFingerprint, sequence)}
    />
  );
}

/** Open the viewer for a post's images; `index` is the 0-based tap index. */
export function openPostImage(post: PostData, index: number) {
  const keyFingerprint = getKeyFingerprint(post.signedBy);
  if (!keyFingerprint) return;
  // URLs count images from 1.
  openWithReturn(
    Routes.tabs.postImage(
      post.identity,
      keyFingerprint,
      post.sequence,
      index + 1,
    ),
  );
}
