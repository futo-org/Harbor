import {
  decodeBundle,
  eventKeyId,
  type PostData,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import {
  COLLECTION,
  parseEventKeyId,
  v2,
  type PolycentricClient,
} from '@polycentric/react-native';
import { create } from 'zustand';
import {
  feedQueryKeys,
  alterPostRepostCount,
  threadQueryKey,
} from '../../feed/hooks/feedCache';

type RepostsState = {
  reposts: Map<string, string>;
  hasReposted: (targetId: string) => boolean;
  addRepost: (client: PolycentricClient, post: PostData) => Promise<void>;
  removeRepost: (client: PolycentricClient, targetId: string) => Promise<void>;
  refresh: (client: PolycentricClient) => Promise<void>;
};

/**
 * Decode `Repost` target/repost ids out of an EventBundle. Returns `null` if the
 * bundle doesn't carry a Repost.
 */
function decodeRepost(
  bundle: v2.EventBundle,
): { event: v2.Event; targetIdHex: string; repostIdHex: string } | null {
  const decoded = decodeBundle(bundle, 'repost');
  if (!decoded) return null;
  const { event } = decoded;
  const target = decoded.content.post;
  if (!target || !event.key) return null;
  return {
    event,
    targetIdHex: eventKeyId(target),
    repostIdHex: eventKeyId(event.key),
  };
}

function invalidateFeeds(client: PolycentricClient, identity: string) {
  invalidateQuery(client, feedQueryKeys.following(identity));
  invalidateQuery(client, feedQueryKeys.identity(identity));
  invalidateQuery(client, feedQueryKeys.explore(identity));
}

const useReposts = create<RepostsState>((set, get) => ({
  reposts: new Map(),
  hasReposted(targetId) {
    return get().reposts.has(targetId);
  },
  /**
   * Build the Repost event for `post.id`, optimistically record the mapping,
   * then commit & sync. Reverts the mapping on error.
   */
  async addRepost(client, post) {
    const reposts = get().reposts;
    if (reposts.has(post.id)) return;

    const targetKey = parseEventKeyId(post.id);
    if (!targetKey) return;
    const repostContent = v2.Content.create({
      contentBody: new v2.ContentBody.Repost({
        repost: v2.Repost.create({ post: targetKey }),
      }),
    });

    const pending = await client.prepareEvent(repostContent, COLLECTION.FEED);
    const repostIdHex = eventKeyId(pending.key);

    set({ reposts: new Map(reposts).set(post.id, repostIdHex) });
    const self = client.activeIdentityKey ?? '';
    alterPostRepostCount(threadQueryKey(post.id), post.id, 1);
    alterPostRepostCount(feedQueryKeys.following(self), post.id, 1);
    alterPostRepostCount(feedQueryKeys.identity(post.identity), post.id, 1);
    alterPostRepostCount(feedQueryKeys.explore(self), post.id, 1);

    try {
      await client.commitEvent(pending);
      await client.sync();
      invalidateFeeds(client, client.activeIdentityKey ?? post.identity);
    } catch (err) {
      console.error(err);
      set({ reposts });
    }
  },
  /**
   * Tombstone the repost event for `targetId`, optimistically removing the
   * mapping. Reverts on error.
   */
  async removeRepost(client, targetId) {
    const self = client.activeIdentityKey;
    if (!self) return;

    const reposts = get().reposts;
    const bundles = await client.listValidEvents(self, COLLECTION.FEED);

    // Tombstone every Repost for `targetId` (a single identity may have
    // multiple events across signing keys)
    const targets = bundles.map(decodeRepost).filter(
      (
        entry,
      ): entry is {
        event: v2.Event;
        targetIdHex: string;
        repostIdHex: string;
      } => entry !== null && entry.targetIdHex === targetId,
    );

    const next = new Map(reposts);
    next.delete(targetId);
    set({ reposts: next });
    // The server counts every repost event, so drop one per tombstoned event
    const repostCountChange = -targets.length;
    alterPostRepostCount(threadQueryKey(targetId), targetId, repostCountChange);
    alterPostRepostCount(
      feedQueryKeys.following(self),
      targetId,
      repostCountChange,
    );
    alterPostRepostCount(
      feedQueryKeys.identity(parseEventKeyId(targetId)?.identity ?? ''),
      targetId,
      repostCountChange,
    );
    alterPostRepostCount(
      feedQueryKeys.explore(self),
      targetId,
      repostCountChange,
    );

    try {
      for (const { event } of targets) {
        if (!event.key) continue;
        const deleteContent = v2.Content.create({
          contentBody: new v2.ContentBody.Delete({
            delete: v2.Delete.create({ eventKey: event.key }),
          }),
        });
        await client.publish(deleteContent, COLLECTION.FEED);
      }
    } catch (err) {
      console.error(err);
      set({ reposts });
    }

    if (targets.length > 0) {
      await client.sync();
      invalidateFeeds(client, self);
    }
  },
  /**
   * Read live repost events from the local outbox and rebuild the map.
   */
  async refresh(client) {
    const identity = client.activeIdentityKey;
    if (!identity) return;
    const bundles = await client.listValidEvents(identity, COLLECTION.FEED);
    const reposts = new Map<string, string>();
    for (const bundle of bundles) {
      const decoded = decodeRepost(bundle);
      if (decoded) reposts.set(decoded.targetIdHex, decoded.repostIdHex);
    }
    set({ reposts });
  },
}));

export default useReposts;
