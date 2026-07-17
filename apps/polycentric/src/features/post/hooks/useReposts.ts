import {
  eventKeyId,
  hexToBytes,
  type PostData,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import {
  COLLECTION,
  v2,
  type PolycentricClient,
} from '@polycentric/react-native';
import { create } from 'zustand';
import { feedQueryKeys } from '../../feed/hooks/feedCache';

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
  if (!bundle.signedEvent || !bundle.serializedContent?.contentBytes) {
    return null;
  }
  let content: v2.Content;
  try {
    content = v2.Content.fromBinary(bundle.serializedContent.contentBytes);
  } catch {
    return null;
  }
  if (content.contentBody.oneofKind !== 'repost') return null;
  const target = content.contentBody.repost.post;
  if (!target) return null;
  const event = v2.Event.fromBinary(bundle.signedEvent.eventBytes);
  if (!event.key) return null;
  return {
    event,
    targetIdHex: eventKeyId(target),
    repostIdHex: eventKeyId(event.key),
  };
}

function invalidateFeeds(client: PolycentricClient, identity: string) {
  invalidateQuery(client, feedQueryKeys.following());
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

    const targetKey = v2.EventKey.fromBinary(hexToBytes(post.id));
    const repostContent = v2.Content.create({
      contentBody: {
        oneofKind: 'repost',
        repost: { post: targetKey },
      },
    });

    await client.contentManager.save(repostContent);
    const repostEvent = await client.buildEvent(repostContent, COLLECTION.FEED);
    const signedEvent = await client.signEvent(repostEvent);

    const event = v2.Event.fromBinary(signedEvent.eventBytes);
    if (!event.key) return;
    const repostIdHex = eventKeyId(event.key);

    set({ reposts: new Map(reposts).set(post.id, repostIdHex) });

    try {
      await client.commitEvent(signedEvent, repostContent);
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
    const bundles = client.listValidEvents(self, COLLECTION.FEED);

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

    try {
      for (const { event } of targets) {
        if (!event.key) continue;
        const deleteContent = v2.Content.create({
          contentBody: {
            oneofKind: 'delete',
            delete: { eventKey: event.key },
          },
        });
        await client.contentManager.save(deleteContent);
        const deleteEvent = await client.buildEvent(
          deleteContent,
          COLLECTION.FEED,
        );
        const signedDelete = await client.signEvent(deleteEvent);
        await client.commitEvent(signedDelete, deleteContent);
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
    const bundles = client.listValidEvents(identity, COLLECTION.FEED);
    const reposts = new Map<string, string>();
    for (const bundle of bundles) {
      const decoded = decodeRepost(bundle);
      if (decoded) reposts.set(decoded.targetIdHex, decoded.repostIdHex);
    }
    set({ reposts });
  },
}));

export default useReposts;
