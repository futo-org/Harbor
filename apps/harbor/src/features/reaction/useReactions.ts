import {
  eventKeyId,
  decodeBundle,
  hexToBytes,
  type PostData,
} from '@/src/common/lib/polycentric-hooks/helpers';
import {
  feedQueryKeys,
  injectReactionIntoFeedCache,
  threadQueryKey,
} from '@/src/features/feed/hooks/feedCache';
import type { Reaction } from '@/src/features/feed/hooks/overlayTypes';
import {
  COLLECTION,
  v2,
  type PolycentricClient,
} from '@polycentric/react-native';
import { create } from 'zustand';

type ReactionChoice = {
  emoji: string;
  positive: boolean;
};

type ReactionEventDto = ReactionChoice & {
  targetId: string;
  eventId: string;
};

type ReactionsState = {
  // Active reactions made by the current identity, keyed by `targetId`.
  reactions: Map<string, ReactionEventDto>;
  // Add a reaction to `post`: commits a Reaction event and syncs.
  addReaction: (
    client: PolycentricClient,
    post: PostData,
    reaction: ReactionChoice,
  ) => Promise<void>;
  // Remove the current identity's active reaction for `post` by committing a
  // delete event for the cached reaction event, and then syncing.
  removeReaction: (client: PolycentricClient, post: PostData) => Promise<void>;
  // Swap the current identity's reaction on `post` for a new one.
  changeReaction: (
    client: PolycentricClient,
    post: PostData,
    reaction: ReactionChoice,
  ) => Promise<void>;
  // Rebuilds `reactions` from synced events.
  refresh: (client: PolycentricClient) => Promise<void>;
};

/** Map a stored reaction event to the overlay `Reaction` shape. */
function toReaction(dto: ReactionEventDto | undefined): Reaction | undefined {
  if (!dto) return undefined;
  return { emoji: dto.emoji, positive: dto.positive };
}

/**
 * Optimistically overlay the reaction change on feeds that are likely to display
 * the post/reaction.
 */
function injectReactionOverlays(
  client: PolycentricClient,
  post: PostData,
  prev: Reaction | undefined,
  next: Reaction | undefined,
): void {
  const activeIdentity = client.activeIdentityKey ?? '';

  const feedKeys = [
    feedQueryKeys.following(),
    feedQueryKeys.identity(post.identity),
    feedQueryKeys.explore(activeIdentity),
  ];

  for (const key of feedKeys) {
    injectReactionIntoFeedCache(key, post.id, prev, next, true);
  }

  const threadIds = new Set(
    [post.id, post.reply?.parentId, post.reply?.rootId].filter(
      (id): id is string => !!id,
    ),
  );

  for (const id of threadIds) {
    injectReactionIntoFeedCache(threadQueryKey(id), post.id, prev, next, true);
  }
}

const useReactions = create<ReactionsState>((set, get) => {
  /**
   * Create the reaction event and persist it locally.
   * Returns information about the new event so the map can be updated by the
   * caller.
   */
  const commitReactionLocally = async (
    client: PolycentricClient,
    targetId: string,
    emoji: string,
    positive: boolean,
  ): Promise<ReactionEventDto | undefined> => {
    // Decode the target post id back into an EventKey so the Reaction
    // Content can carry it (the proto field that refresh reads back).
    const targetKey = v2.EventKey.fromBinary(hexToBytes(targetId));
    const content = v2.Content.create({
      contentBody: {
        oneofKind: 'reaction',
        reaction: { eventKey: targetKey, emoji, positive },
      },
    });

    await client.contentManager.save(content);
    const event = await client.buildEvent(content, COLLECTION.INTERACTIONS);
    const signedEvent = await client.signEvent(event);
    if (!event.key) return undefined;
    const eventId = eventKeyId(event.key);

    await client.commitEvent(signedEvent, content);

    return { targetId, emoji, positive, eventId };
  };

  /**
   * Tombstone `active` by committing a delete event for its reaction event.
   */
  const commitDeleteLocally = async (
    client: PolycentricClient,
    active: ReactionEventDto,
  ): Promise<void> => {
    const reactionKey = v2.EventKey.fromBinary(hexToBytes(active.eventId));

    const deleteContent = v2.Content.create({
      contentBody: {
        oneofKind: 'delete',
        delete: { eventKey: reactionKey },
      },
    });
    await client.contentManager.save(deleteContent);
    const deleteEvent = await client.buildEvent(
      deleteContent,
      COLLECTION.INTERACTIONS,
    );
    const signedDelete = await client.signEvent(deleteEvent);

    await client.commitEvent(signedDelete, deleteContent);
  };

  return {
    reactions: new Map(),

    /**
     * Add a reaction to `post`.
     * Old reactions should be removed first.
     */
    async addReaction(client, post, { emoji, positive }) {
      if (!client.activeIdentityKey) return;

      const dto = await commitReactionLocally(client, post.id, emoji, positive);
      if (!dto) return;

      const reactions = new Map(get().reactions).set(post.id, dto);
      set({ reactions });

      // Optimistically overlay the change before the network sync.
      injectReactionOverlays(client, post, undefined, toReaction(dto));

      try {
        await client.sync();
      } catch (err) {
        console.warn('reaction sync failed:', err);
      }
    },

    /**
     * Remove the current identity's active reaction for `post`.
     */
    async removeReaction(client, post) {
      if (!client.activeIdentityKey) return;

      const active = get().reactions.get(post.id);
      if (!active) return;

      await commitDeleteLocally(client, active);

      const reactions = new Map(get().reactions);
      reactions.delete(post.id);
      set({ reactions });

      injectReactionOverlays(client, post, toReaction(active), undefined);

      try {
        await client.sync();
      } catch (err) {
        console.warn('reaction sync failed:', err);
      }
    },

    /**
     * Swap the current identity's reaction on `post` for a new one.
     */
    async changeReaction(client, post, { emoji, positive }) {
      if (!client.activeIdentityKey) return;

      const active = get().reactions.get(post.id);
      if (active) await commitDeleteLocally(client, active);

      const dto = await commitReactionLocally(client, post.id, emoji, positive);
      if (!dto) return;

      const reactions = new Map(get().reactions).set(post.id, dto);
      set({ reactions });

      injectReactionOverlays(client, post, toReaction(active), toReaction(dto));

      try {
        await client.sync();
      } catch (err) {
        console.warn('reaction sync failed:', err);
      }
    },

    /**
     * Rebuilds `reactions` from the current identity's non-tombstoned Reaction events.
     */
    async refresh(client) {
      const self = client.activeIdentityKey;
      if (!self) return;

      const bundles = client.listValidEvents(self, COLLECTION.INTERACTIONS);

      // Collect the latest reaction per target.
      const latest = new Map<
        string,
        { dto: ReactionEventDto; sequence: number }
      >();
      for (const bundle of bundles) {
        const decoded = decodeBundle(bundle, 'reaction');
        if (!decoded) continue;
        const targetKey = decoded.content.eventKey;
        const emoji = decoded.content.emoji;
        const reactionKey = decoded.event.key;
        // Need a target, an emoji, and the reaction event's own key.
        if (!targetKey || !emoji || !reactionKey) continue;

        const targetId = eventKeyId(targetKey);
        const eventId = eventKeyId(reactionKey);
        const sequence = Number(decoded.event.key?.sequence ?? 0);

        const prev = latest.get(targetId);
        if (!prev || sequence > prev.sequence) {
          latest.set(targetId, {
            dto: {
              targetId,
              emoji,
              positive: decoded.content.positive,
              eventId,
            },
            sequence,
          });
        }
      }

      // Hydrate the reactions map
      const reactions = new Map<string, ReactionEventDto>();
      for (const [targetId, { dto }] of latest) {
        reactions.set(targetId, dto);
      }

      set({ reactions });
    },
  };
});
export default useReactions;
