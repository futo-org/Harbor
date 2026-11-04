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
    const follows = get().follows;

    const content = v2.Content.create({
      contentBody: new v2.ContentBody.Follow({
        follow: v2.Follow.create({ identity }),
      }),
    });

    const pending = await client.prepareEvent(content, COLLECTION.GRAPH);

    // Optimistically upate the state
    set({ follows: new Map(follows).set(identity, true) });

    try {
      await client.commitEvent(pending);
      await client.sync();
      // `identity` is the followee; the feed belongs to the follower.
      invalidateQuery(
        client,
        feedQueryKeys.following(client.activeIdentityKey ?? ''),
      );
    } catch (err) {
      console.error(err);
      // revert the change
      set({ follows });
    }
  },
  /**
   * Creates a Delete event for the last know Follow event and sync
   */
  async removeFollow(client, identity) {
    const self = client.activeIdentityKey;
    if (!self) return;

    const follows = get().follows;

    const bundles = await client.listValidEvents(self, COLLECTION.GRAPH);

    // Tombstone every active Follow event this identity wrote that targets
    // `identity`. A single identity may have multiple follow events across
    // signing keys — delete them all.
    const targets = bundles
      .map((bundle) => decodeBundle(bundle, 'follow'))
      .filter(
        (entry): entry is DecodedBundle<'follow'> =>
          entry !== null && entry.content.identity === identity,
      );

    // Optimistically upate the state
    const next = new Map(follows);
    next.delete(identity);
    set({ follows: next });

    try {
      for (const { event } of targets) {
        if (!event.key) continue;
        const deleteContent = v2.Content.create({
          contentBody: new v2.ContentBody.Delete({
            delete: v2.Delete.create({ eventKey: event.key }),
          }),
        });
        await client.publish(deleteContent, COLLECTION.GRAPH);
      }
    } catch (err) {
      console.error(err);
      // Revert the state change
      set({ follows });
    }

    if (targets.length > 0) {
      await client.sync();
      invalidateQuery(
        client,
        feedQueryKeys.following(client.activeIdentityKey ?? ''),
      );
    }
  },
  /**
   * Returns the synced and valid (post tombstoned) Follow events
   */
  async refresh(client) {
    const identity = client.activeIdentityKey;
    if (!identity) return;

    const bundles = await client.listValidEvents(identity, COLLECTION.GRAPH);

    const follows = new Map<string, boolean>();
    for (const bundle of bundles) {
      const entry = decodeBundle(bundle, 'follow');
      if (entry) follows.set(entry.content.identity, true);
    }

    set({ follows });
  },
}));
export default useFollows;
