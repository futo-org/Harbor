import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import { COLLECTION, SyncStrategy, v2 } from '@polycentric/react-native';
import { router } from 'expo-router';
import { claimEventKey } from '../utils/claim-id';
import type { DecodedClaim } from './useClaimById';

type Client = ReturnType<typeof usePolycentric>;

/** Tombstone a claim with a Delete event. Pushed to servers best-effort. */
export async function deleteClaim(
  client: Client,
  claimId: string,
): Promise<void> {
  const eventKey = claimEventKey(claimId);
  const deleteContent = v2.Content.create({
    contentBody: new v2.ContentBody.Delete({
      delete: v2.Delete.create({ eventKey }),
    }),
  });
  await client.publish(deleteContent, COLLECTION.VERIFICATIONS);

  try {
    await client.sync(SyncStrategy.PartialPush);
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
