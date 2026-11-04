import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import { COLLECTION, SyncStrategy, v2 } from '@polycentric/react-native';
import { useState } from 'react';
import { claimEventKey } from '../utils/claim-id';
import { verifierApi } from '../utils/verifier-api';

type Client = ReturnType<typeof usePolycentric>;

/**
 * Publish a VerificationTarget aiming a claim at identities. Committed
 * locally — the caller owns syncing.
 */
export async function publishVerificationTarget(
  client: Client,
  claimEventKey: v2.EventKey,
  targetIdentities: string[],
): Promise<void> {
  const content = v2.Content.create({
    contentBody: new v2.ContentBody.VerificationTarget({
      verificationTarget: v2.VerificationTarget.create({
        claimEventKey,
        targetIdentities,
      }),
    }),
  });
  await client.publish(content, COLLECTION.VERIFICATIONS);
  try {
    await client.sync(SyncStrategy.PartialPush);
  } catch (err) {
    console.error(err);
  }
}

/**
 * Publish a VerificationTarget aiming a claim at the configured verifier
 * bots, so a bot verify is preceded by a request like any other
 * verification. `claimId` is the hex event key (`DecodedClaim.id`).
 */
export async function publishVerifierBotTargets(
  client: Client,
  claimId: string,
): Promise<void> {
  const bots = await verifierApi.verifierIdentities();
  if (bots.size === 0) return;
  await publishVerificationTarget(client, claimEventKey(claimId), [...bots]);
  invalidateQuery(client, ['verification-targets', claimId]);
}

// Request verification of an existing claim from a specific identity.
export default function useRequestVerification() {
  const client = usePolycentric();
  const [isPending, setPending] = useState(false);

  return {
    isPending,
    submit: async ({
      claimId,
      identity,
    }: {
      // Hex-encoded claim event key (`DecodedClaim.id`).
      claimId: string;
      // Identity to request the verification from.
      identity: string;
    }): Promise<void> => {
      if (isPending) {
        throw 'Already pending';
      }
      setPending(true);
      try {
        await publishVerificationTarget(client, claimEventKey(claimId), [
          identity,
        ]);

        // Delivery to servers is best-effort — the target is already saved
        // locally and will be pushed on the next sync if this fails.
        try {
          await client.sync(SyncStrategy.PartialPush);
        } catch (e) {
          console.warn('Failed to push verification target to servers:', e);
        }

        // Refresh the claim's requested-verifiers list.
        invalidateQuery(client, ['verification-targets', claimId]);
      } finally {
        setPending(false);
      }
    },
  };
}
