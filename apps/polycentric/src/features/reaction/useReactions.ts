import {
  COLLECTION,
  v2,
  type PolycentricClient,
} from '@polycentric/react-native';
import { create } from 'zustand';

type ReactionsState = {
  reactions: Map<string, boolean>;
  hasReacted: (identity: string) => boolean;
  addReaction: (client: PolycentricClient, identity: string) => Promise<void>;
  removeReaction: (
    client: PolycentricClient,
    identity: string,
  ) => Promise<void>;
  refresh: (client: PolycentricClient) => Promise<void>;
};

/**
 * Decode a `Reaction` content out of an EventBundle. Returns `null` if the
 * bundle doesn't carry a Reaction.
 */
function decodeReaction(bundle: v2.EventBundle): { event: v2.Event } | null {
  if (!bundle.signedEvent || !bundle.serializedContent?.contentBytes) {
    return null;
  }
  let content: v2.Content;
  try {
    content = v2.Content.fromBinary(bundle.serializedContent.contentBytes);
  } catch {
    return null;
  }
  if (content.contentBody.oneofKind !== 'reaction') return null;
  const event = v2.Event.fromBinary(bundle.signedEvent.eventBytes);
  return { event };
}

const useReactions = create<ReactionsState>((set, get) => ({
  reactions: new Map(),
  hasReacted(identity) {
    return !!get().reactions.get(identity);
  },
  /**
   * Creates the Reaction event and syncs
   */
  async addReaction(client, identity) {
    const follows = get().reactions;

    const content = v2.Content.create({
      contentBody: {
        oneofKind: 'follow',
        follow: { identity },
      },
    });

    await client.contentManager.save(content);
    const event = await client.buildEvent(content, COLLECTION.GRAPH);
    const signedEvent = await client.signEvent(event);

    // Optimistically upate the state
    set({ reactions: new Map(follows).set(identity, true) });

    try {
      await client.commitEvent(signedEvent, content);
      await client.sync();
    } catch (err) {
      console.error(err);
      // revert the change
      set({ reactions: follows });
    }
  },
  /**
   * Creates a Delete event for the last know Reaction event and sync
   */
  async removeReaction(client, identity) {
    const self = client.activeIdentityKey;
    if (!self) return;

    const follows = get().reactions;

    const bundles = client.listValidEvents(self, COLLECTION.GRAPH);

    // Tombstone every active Reaction event this identity wrote that targets
    // `identity`. A single identity may have multiple follow events across
    // signing keys — delete them all.
    const targets = bundles
      .map(decodeReaction)
      .filter(
        (entry): entry is { event: v2.Event; identity: string } =>
          entry !== null,
      );

    // Optimistically upate the state
    const next = new Map(follows);
    next.delete(identity);
    set({ reactions: next });

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
          COLLECTION.GRAPH,
        );
        const signedDelete = await client.signEvent(deleteEvent);
        await client.commitEvent(signedDelete, deleteContent);
      }
    } catch (err) {
      console.error(err);
      // Revert the state change
      set({ reactions: follows });
    }

    if (targets.length > 0) {
      await client.sync();
    }
  },
  /**
   * Returns the synced and valid (post tombstoned) Reaction events
   */
  async refresh(client) {
    const identity = client.activeIdentityKey;
    if (!identity) return;

    const bundles = client.listValidEvents(identity, COLLECTION.GRAPH);

    const follows = new Map<string, boolean>();
    for (const bundle of bundles) {
      const entry = decodeReaction(bundle);
      // if (entry) follows.set(entry.identity, true);
    }

    set({ reactions: follows });
  },
}));
export default useReactions;
