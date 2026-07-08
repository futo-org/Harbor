import {
  hexToBytes,
  useCurrentIdentity,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import { COLLECTION, SyncStrategy, v2 } from '@polycentric/react-native';
import { useState } from 'react';

type Client = ReturnType<typeof usePolycentric>;

/**
 * Publish a VerificationTarget aiming a claim at an identity. Committed
 * locally — the caller owns syncing.
 */
export async function publishVerificationTarget(
  client: Client,
  claimEventKey: v2.EventKey,
  targetIdentity: string,
): Promise<void> {
  const content = v2.Content.create({
    contentBody: {
      oneofKind: 'verificationTarget',
      verificationTarget: {
        claimEventKey,
        targetIdentities: [targetIdentity],
      },
    },
  });
  await client.contentManager.save(content);
  const event = await client.buildEvent(content, COLLECTION.VERIFICATIONS);
  const signedEvent = await client.signEvent(event);
  await client.commitEvent(signedEvent, content);
}

// Request verification of an existing claim from a specific identity.
export default function useRequestVerification() {
  const client = usePolycentric();
  const { identityKey } = useCurrentIdentity();
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
        const claimEventKey = v2.EventKey.fromBinary(hexToBytes(claimId));
        await publishVerificationTarget(client, claimEventKey, identity);

        // Delivery to servers is best-effort — the target is already saved
        // locally and will be pushed on the next sync if this fails.
        try {
          await client.sync(SyncStrategy.PARTIAL_PUSH);
        } catch (e) {
          console.warn('Failed to push verification target to servers:', e);
        }

        // Refresh the pending-requests list for this verifier.
        if (identityKey) {
          invalidateQuery(client, [
            'verification-requests',
            identityKey,
            identity,
          ]);
        }
      } finally {
        setPending(false);
      }
    },
  };
}
