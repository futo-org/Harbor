import {
  COLLECTION,
  v2,
  type PolycentricClient,
} from '@polycentric/react-native';
import { create } from 'zustand';

type FollowsState = {
  follows: Map<string, boolean>;
  isFollowing: (identity: string) => boolean;
  addFollow: (client: PolycentricClient, identity: string) => Promise<void>;
  removeFollow: (client: PolycentricClient, identity: string) => Promise<void>;
  refresh: (client: PolycentricClient) => Promise<void>;
};

/**
 * Decode a `Follow` content out of an EventBundle. Returns `null` if the
 * bundle doesn't carry a Follow.
 */
function decodeFollow(
  bundle: v2.EventBundle,
): { event: v2.Event; identity: string } | null {
  if (!bundle.signedEvent || !bundle.serializedContent?.contentBytes) {
    return null;
  }
  let content: v2.Content;
  try {
    content = v2.Content.fromBinary(bundle.serializedContent.contentBytes);
  } catch {
    return null;
  }
  if (content.contentBody.oneofKind !== 'follow') return null;
  const event = v2.Event.fromBinary(bundle.signedEvent.eventBytes);
  return { event, identity: content.contentBody.follow.identity };
}

const useFollows = create<FollowsState>((set, get) => ({
  follows: new Map(),
  isFollowing(identity) {
    return !!get().follows.get(identity);
  },
  /**
   * Creates the Follow event and syncs
   */
  async addFollow(client, identity) {
    const content = v2.Content.create({
      contentBody: {
        oneofKind: 'follow',
        follow: { identity },
      },
    });

    await client.contentManager.save(content);
    const event = await client.buildEvent(content, COLLECTION.GRAPH);
    const signedEvent = await client.signEvent(event);
    await client.commitEvent(signedEvent, content);
    await client.sync();

    set({ follows: new Map(get().follows).set(identity, true) });
  },
  /**
   * Creates a Delete event for the last know Follow event and sync
   */
  async removeFollow(client, identity) {
    const self = client.activeIdentityKey;
    if (!self) return;

    const bundles = client.listValidEvents(self, COLLECTION.GRAPH);

    // Tombstone every active Follow event this identity wrote that targets
    // `identity`. A single identity may have multiple follow events across
    // signing keys — delete them all.
    const targets = bundles
      .map(decodeFollow)
      .filter(
        (entry): entry is { event: v2.Event; identity: string } =>
          entry !== null && entry.identity === identity,
      );

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

    if (targets.length > 0) {
      await client.sync();
    }

    const next = new Map(get().follows);
    next.delete(identity);
    set({ follows: next });
  },
  /**
   * Returns the synced and valid (post tombstoned) Follow events
   */
  async refresh(client) {
    const identity = client.activeIdentityKey;
    if (!identity) return;

    const bundles = client.listValidEvents(identity, COLLECTION.GRAPH);

    const follows = new Map<string, boolean>();
    for (const bundle of bundles) {
      const entry = decodeFollow(bundle);
      if (entry) follows.set(entry.identity, true);
    }

    set({ follows });
  },
}));
export default useFollows;
