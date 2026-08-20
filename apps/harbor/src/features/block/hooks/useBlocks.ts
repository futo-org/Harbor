import {
  COLLECTION,
  v2,
  type PolycentricClient,
} from '@polycentric/react-native';
import {
  decodeBundle,
  type DecodedBundle,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { invalidateAllQueries } from '@/src/common/query/hooks/useQuery';
import { create } from 'zustand';

type BlocksState = {
  blocks: Map<string, boolean>;

  isBlocked: (identity: string) => boolean;
  addBlock: (client: PolycentricClient, identity: string) => Promise<void>;
  removeBlock: (client: PolycentricClient, identity: string) => Promise<void>;
  refresh: (client: PolycentricClient) => Promise<void>;
};

function hasSameIdentities(
  a: Map<string, boolean>,
  b: Map<string, boolean>,
): boolean {
  if (a.size !== b.size) return false;
  for (const identity of a.keys()) {
    if (!b.has(identity)) return false;
  }
  return true;
}

/**
 * Blocked identities of the active user. Even though blocked content is removed
 * from query results by `polycentric-core`, block state should be provided to
 * react native components related to managing that block state.
 */
const useBlocks = create<BlocksState>((set, get) => {
  const setBlocks = (blocks: Map<string, boolean>) => set({ blocks });

  return {
    blocks: new Map(),

    isBlocked(identity) {
      return !!get().blocks.get(identity);
    },

    async addBlock(client, identity) {
      const blocks = get().blocks;

      const content = v2.Content.create({
        contentBody: {
          oneofKind: 'block',
          block: { identity },
        },
      });

      await client.contentManager.save(content);
      const event = await client.buildEvent(content, COLLECTION.GRAPH);
      const signedEvent = await client.signEvent(event);

      setBlocks(new Map(blocks).set(identity, true));

      try {
        await client.commitEvent(signedEvent, content);
      } catch (err) {
        console.error(err);
        setBlocks(blocks);
        return;
      }

      // A failed push does not reject; the next sync pushes the event again.
      await client.sync().catch((err) => console.error(err));
      invalidateAllQueries(client);
    },

    async removeBlock(client, identity) {
      const self = client.activeIdentityKey;
      if (!self) return;

      const blocks = get().blocks;

      const bundles = client.listValidEvents(self, COLLECTION.GRAPH);

      const targets = bundles
        .map((bundle) => decodeBundle(bundle, 'block'))
        .filter(
          (entry): entry is DecodedBundle<'block'> =>
            entry !== null && entry.content.identity === identity,
        );

      const next = new Map(blocks);
      next.delete(identity);
      setBlocks(next);

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
        setBlocks(blocks);
        return;
      }

      if (targets.length > 0) {
        await client.sync().catch((err) => console.error(err));
        invalidateAllQueries(client);
      }
    },

    async refresh(client) {
      if (!client.activeIdentityKey) return;

      const blocks = new Map<string, boolean>(
        client.blockedIdentities().map((identity) => [identity, true]),
      );

      if (!hasSameIdentities(blocks, get().blocks)) setBlocks(blocks);
    },
  };
});
export default useBlocks;
