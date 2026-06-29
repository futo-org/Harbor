import { hexToBytes, usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import { COLLECTION, SyncStrategy, v2 } from '@polycentric/react-native';
import { router } from 'expo-router';
import { DecodedClaim } from './useClaimById';

// Actions for a verification claim (currently just delete).
export default function useClaimActions(claim: DecodedClaim) {
  const client = usePolycentric();

  // Tombstone the claim with a Delete event referencing its key, then refresh
  // the creator's list and leave the now-deleted claim's screen.
  const deleteAsync = async () => {
    const eventKey = v2.EventKey.fromBinary(hexToBytes(claim.id));
    const deleteContent = v2.Content.create({
      contentBody: { oneofKind: 'delete', delete: { eventKey } },
    });
    await client.contentManager.save(deleteContent);
    const deleteEvent = await client.buildEvent(
      deleteContent,
      COLLECTION.VERIFICATIONS,
    );
    const signedDelete = await client.signEvent(deleteEvent);
    await client.commitEvent(signedDelete, deleteContent);

    try {
      await client.sync(SyncStrategy.PARTIAL_PUSH);
    } catch (e) {
      console.warn('Failed to push claim deletion to servers:', e);
    }

    invalidateQuery(client, ['claims-list', claim.identity]);

    if (router.canGoBack()) router.back();
  };

  return { deleteAsync };
}
