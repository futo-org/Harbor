import {
  bytesToHex,
  decodeBundle,
  hexToBytes,
} from '@/src/common/lib/polycentric-hooks/helpers';
import {
  COLLECTION,
  v2,
  type PolycentricClient,
} from '@polycentric/react-native';
import { create } from 'zustand';

type ReactionDto = {
  targetId: string;
  emoji: string;
  positive: boolean;
};

type ReactionEventDto = ReactionDto & {
  eventId: string;
};

type ReactionCounts = Record<string, number>;

type ReactionsState = {
  // Active reactions made by the current identity, keyed by `targetId`.
  reactions: Map<string, ReactionEventDto>;
  // Per-target emoji counts for all eventIds hydrated.
  reactionCounts: Map<string, ReactionCounts>;
  // Returns the current identity's active reaction for `targetId`.
  getReaction: (targetId: string) => ReactionEventDto | undefined;
  // Per-emoji counts for `targetId` (sum the values for the total count).
  getReactionCount: (targetId: string) => ReactionCounts;
  // Add a reaction; commits a Reaction event for `targetId`.
  addReaction: (
    client: PolycentricClient,
    reaction: ReactionDto,
  ) => Promise<void>;
  // Remove the current identity's active reaction for `targetId` by
  // committing a Delete event for the cached reaction event.
  removeReaction: (
    client: PolycentricClient,
    targetId: string,
  ) => Promise<void>;
  // Rebuilds `reactions` + `reactionCounts` from synced events.
  refresh: (client: PolycentricClient) => Promise<void>;
};

const useReactions = create<ReactionsState>((set, get) => ({
  reactions: new Map(),
  reactionCounts: new Map(),
  getReaction(targetId) {
    return get().reactions.get(targetId);
  },
  getReactionCount(targetId) {
    return get().reactionCounts.get(targetId) ?? {};
  },

  /**
   * Adds a reaction. Does not remove prior reactions, call removeReaction first!
   */
  async addReaction(client, reaction) {
    const { targetId, emoji, positive } = reaction;

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
    if (!event.key) return;
    const eventId = bytesToHex(v2.EventKey.toBinary(event.key));

    // Snapshot for revert.
    const prev = {
      reactions: get().reactions,
      reactionCounts: get().reactionCounts,
    };

    // Optimistic update.
    const nextReactions = new Map(prev.reactions).set(targetId, {
      targetId,
      emoji,
      positive,
      eventId,
    });
    const eventCounts = { ...(prev.reactionCounts.get(targetId) ?? {}) };
    eventCounts[emoji] = (eventCounts[emoji] ?? 0) + 1;
    const nextCounts = new Map(prev.reactionCounts).set(targetId, eventCounts);
    set({ reactions: nextReactions, reactionCounts: nextCounts });

    try {
      await client.commitEvent(signedEvent, content);
      await client.sync();
    } catch (err) {
      console.error(err);
      set(prev);
    }
  },

  /**
   * Tombstones the current identity's active reaction for `targetId` by
   * committing a Delete event for its cached reaction event. The active
   * reaction is read from `reactions` — `refresh` keeps that current.
   */
  async removeReaction(client, targetId) {
    const active = get().reactions.get(targetId);
    if (!active) return;
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

    // Snapshot for revert.
    const prev = {
      reactions: get().reactions,
      reactionCounts: get().reactionCounts,
    };

    // Optimistic update.
    const nextReactions = new Map(prev.reactions);
    nextReactions.delete(targetId);
    const eventCounts = { ...(prev.reactionCounts.get(targetId) ?? {}) };
    eventCounts[active.emoji] = Math.max(
      0,
      (eventCounts[active.emoji] ?? 0) - 1,
    );
    const nextCounts = new Map(prev.reactionCounts).set(targetId, eventCounts);
    set({ reactions: nextReactions, reactionCounts: nextCounts });

    try {
      await client.commitEvent(signedDelete, deleteContent);
      await client.sync();
    } catch (err) {
      console.error(err);
      set(prev);
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

      const targetId = bytesToHex(v2.EventKey.toBinary(targetKey));
      const eventId = bytesToHex(v2.EventKey.toBinary(reactionKey));
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

    // Hydrate the maps
    const reactions = new Map<string, ReactionEventDto>();
    for (const [targetId, { dto }] of latest) {
      reactions.set(targetId, dto);
    }

    set({ reactions });
  },
}));
export default useReactions;
