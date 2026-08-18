import {
  hexToBytes,
  type PostData,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';
import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import { COLLECTION, v2, SyncStrategy } from '@polycentric/react-native';
import { router, useLocalSearchParams, useSegments } from 'expo-router';
import {
  alterPostReplyCount,
  feedQueryKeys,
  threadQueryKey,
} from '@/src/features/feed/hooks/feedCache';

type PostActions = {
  /**
   * Reports a post to the moderation system
   */
  reportAsync: () => Promise<void>;
  /**
   * Deletes a post.
   * Delete events act as tombstone of a referenced event.
   */
  deleteAsync: () => Promise<void>;
};

/**
 * Various actions relating to a post, such as deleting, editing,
 * reporting, etc.
 */
export default function usePostActions(post: PostData): PostActions {
  const client = usePolycentric();
  const segments = useSegments();

  const { identityId, keyFingerprint, sequence } = useLocalSearchParams<{
    identityId?: string;
    keyFingerprint?: string;
    sequence?: string;
  }>();

  // Tombstone the event identified by `hexEventKey` (a FEED-collection
  // Delete referencing it).
  const deleteEventAtKey = async (hexEventKey: string) => {
    const eventKey = v2.EventKey.fromBinary(hexToBytes(hexEventKey));
    const deleteContent = v2.Content.create({
      contentBody: {
        oneofKind: 'delete',
        delete: { eventKey },
      },
    });
    await client.contentManager.save(deleteContent);
    const deleteEvent = await client.buildEvent(deleteContent, COLLECTION.FEED);
    const signedDelete = await client.signEvent(deleteEvent);
    await client.commitEvent(signedDelete, deleteContent);

    // TODO: do we care if push failed?
    await client.sync(SyncStrategy.PARTIAL_PUSH);
  };

  const invalidateFeeds = (identity: string, deletionParent?: string) => {
    invalidateQuery(client, feedQueryKeys.following(identity));
    invalidateQuery(client, feedQueryKeys.identity(identity));
    invalidateQuery(client, feedQueryKeys.explore(identity));

    if (deletionParent) {
      alterPostReplyCount(
        feedQueryKeys.following(identity),
        deletionParent,
        -1,
      );
      alterPostReplyCount(feedQueryKeys.identity(identity), deletionParent, -1);
      alterPostReplyCount(feedQueryKeys.explore(identity), deletionParent, -1);
    }
  };

  const invalidateThreads = (reply: PostData['reply'], deletion?: boolean) => {
    if (!reply) return;

    const parents = [reply.parentId, reply.rootId].filter(
      (id): id is string => !!id,
    );

    for (const parentId of new Set(parents)) {
      const key = threadQueryKey(parentId);
      invalidateQuery(client, key);

      if (reply.parentId && deletion) {
        alterPostReplyCount(key, reply.parentId, -1);
      }
    }
  };

  return {
    reportAsync: async () => {
      // TODO: discuss if we should record report events or
      // treat them as private interactions direct to server.
    },
    deleteAsync: async () => {
      await deleteEventAtKey(post.id);
      invalidateFeeds(post.identity, post.reply?.parentId);
      invalidateThreads(post.reply, true);

      // We want to change the active page if we are currently viewing the post
      // that just got deleted:

      const onPostScreen =
        segments[0] === '[identityId]' && segments[1] === 'post';

      const isSubject =
        post.identity === identityId &&
        getKeyFingerprint(post.signedBy) === keyFingerprint &&
        post.sequence === sequence;

      if (onPostScreen && isSubject) {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('../../');
        }
        return;
      }
    },
  };
}
