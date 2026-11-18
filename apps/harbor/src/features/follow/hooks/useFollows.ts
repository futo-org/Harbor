import {
  COLLECTION,
  v2,
  type PolycentricClient,
} from '@polycentric/react-native';
import {
  decodeBundle,
  type DecodedBundle,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import { feedQueryKeys } from '../../feed/hooks/feedCache';
import { create } from 'zustand';

type FollowsState = {
  follows: Map<string, boolean>;
  isFollowing: (identity: string) => boolean;
  addFollow: (client: PolycentricClient, identity: string) => Promise<void>;
  removeFollow: (client: PolycentricClient, identity: string) => Promise<void>;
  refresh: (client: PolycentricClient) => Promise<void>;
};

const useFollows = create<FollowsState>((set, get) => ({
  follows: new Map(),
  isFollowing(identity) {
    return !!get().follows.get(identity);
  },
  /**
   * Creates the Follow event and syncs
   */
  async addFollow(client, identity) {
    const self = client.activeIdentityKey ?? '';
    const follows = get().follows;

    const content = v2.Content.create({
      contentBody: {
        oneofKind: 'follow',
        follow: { identity },
      },
    });

    // Create local event and immediately apply the new follow state
    try {
      await client.createEvent({ collection: COLLECTION.GRAPH, content });
      set({ follows: new Map(follows).set(identity, true) });
    } catch (err) {
      console.error(err);
      return;
    }

    // Sync to remotes and invalidate following feed
    try {
      await client.sync();
      invalidateQuery(client, feedQueryKeys.following(self));
    } catch (err) {
      console.error(err);
    }
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
      .map((bundle) => decodeBundle(bundle, 'follow'))
      .filter(
        (entry): entry is DecodedBundle<'follow'> =>
          entry !== null && entry.content.identity === identity,
      );

    // Create local delete events and then apply the new follow state
    try {
      for (const { event } of targets) {
        if (!event.key) continue;
        const deleteContent = v2.Content.create({
          contentBody: {
            oneofKind: 'delete',
            delete: { eventKey: event.key },
          },
        });
        await client.createEvent({
          collection: COLLECTION.GRAPH,
          content: deleteContent,
        });
      }

      const follows = new Map(get().follows);
      follows.delete(identity);
      set({ follows });
    } catch (err) {
      console.error(err);
      return;
    }

    if (targets.length === 0) return;

    // Sync to remotes and invalidate following feed
    try {
      await client.sync();
      invalidateQuery(client, feedQueryKeys.following(self));
    } catch (err) {
      console.error(err);
    }
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
      const entry = decodeBundle(bundle, 'follow');
      if (entry) follows.set(entry.content.identity, true);
    }

    set({ follows });
  },
}));
export default useFollows;
