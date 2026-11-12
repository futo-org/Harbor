import { ListEmpty } from '@/src/common/components/ListEmpty';
import { usePostById } from '@/src/features/post/hooks/usePostById';
import { ThreadList } from '@/src/features/post/ThreadList';

/** The post the Harbor tab is on, to read and reply to beside it. */
export function ExtensionThread({
  identityId,
  keyFingerprint,
  sequence,
}: {
  identityId: string;
  keyFingerprint: string;
  sequence: string;
}) {
  const { post, isLoading } = usePostById(
    identityId,
    keyFingerprint,
    BigInt(sequence),
  );
  if (post) return <ThreadList post={post} />;
  return isLoading ? null : <ListEmpty>Post not found</ListEmpty>;
}
