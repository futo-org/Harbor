import {
  hexToBytes,
  PostData,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import { COLLECTION, v2 } from '@polycentric/react-native';
import { router, useSegments } from 'expo-router';
import { feedQueryKeys } from '../../feed/hooks/feedCache';

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
  /**
   * Creates a 'Repost'.
   * Different to quote posts. To make a quote post, make a normal
   * post with a 'quote' field, referencing the post you wish to quote.
   */
  repostAsync: () => Promise<void>;
  /**
   * Undo a repost by tombstoning the repost event itself (the event
   * identified by `post.repostId`). No-op when the item isn't a repost.
   */
  undoRepostAsync: () => Promise<void>;
};

/**
 * Various actions relating to a post, such as deleting, editing,
 * reporting, etc.
 */
export default function usePostActions(post: PostData): PostActions {
  const client = usePolycentric();
  const segments = useSegments();

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
    await client.push();
  };

  const invalidateFeeds = (identity: string) => {
    invalidateQuery(client, feedQueryKeys.following());
    invalidateQuery(client, feedQueryKeys.identity(identity));
    invalidateQuery(client, feedQueryKeys.explore(identity));
  };

  return {
    reportAsync: async () => {
      // TODO: discuss if we should record report events or
      // treat them as private interactions direct to server.
    },
    deleteAsync: async () => {
      await deleteEventAtKey(post.id);
      invalidateFeeds(post.identity);

      if (segments[0] === '[identityId]' && segments[1] === 'post') {
        // Redirect to profile
        router.navigate('../../');
        return;
      }
    },
    undoRepostAsync: async () => {
      if (!post.repostId) return;
      await deleteEventAtKey(post.repostId);
      invalidateFeeds(post.repostedBy ?? post.identity);
    },
    repostAsync: async () => {
      const eventKeyBytes = hexToBytes(post.id);

      const eventKey = v2.EventKey.fromBinary(eventKeyBytes);

      const repostContent = v2.Content.create({
        contentBody: {
          oneofKind: 'repost',
          repost: { post: eventKey },
        },
      });
      await client.contentManager.save(repostContent);
      const repostEvent = await client.buildEvent(
        repostContent,
        COLLECTION.FEED,
      );
      const signedEvent = await client.signEvent(repostEvent);
      await client.commitEvent(signedEvent, repostContent);

      // TODO: do we care if push failed?
      await client.push();
    },
  };
}
