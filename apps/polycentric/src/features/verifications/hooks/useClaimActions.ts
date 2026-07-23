import { hexToBytes, usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import { COLLECTION, SyncStrategy, v2 } from '@polycentric/react-native';
import { router } from 'expo-router';
import type { DecodedClaim } from './useClaimById';

type Client = ReturnType<typeof usePolycentric>;

/** Tombstone a claim with a Delete event. Pushed to servers best-effort. */
export async function deleteClaim(
  client: Client,
  claimId: string,
): Promise<void> {
  const eventKey = v2.EventKey.fromBinary(hexToBytes(claimId));
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
}

// Actions for a verification claim (currently just delete).
export default function useClaimActions(claim: DecodedClaim) {
  const client = usePolycentric();

  // Tombstone the claim, refresh the creator's list, and leave the
  // now-deleted claim's screen.
  const deleteAsync = async () => {
    await deleteClaim(client, claim.id);

    invalidateQuery(client, ['claims-list', claim.identity]);

    if (router.canGoBack()) router.back();
  };

  return { deleteAsync };
}
