import {
  hexToBytes,
  useCurrentIdentity,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import { COLLECTION, SyncStrategy, v2 } from '@polycentric/react-native';
import { useState } from 'react';

// Verify a claim as the current identity by publishing a VerificationVerify
// event referencing the claim.
export default function useVerifyClaim() {
  const client = usePolycentric();
  const { identityKey } = useCurrentIdentity();
  const [isPending, setPending] = useState(false);

  return {
    isPending,
    verify: async ({
      claimId,
    }: {
      // Hex-encoded claim event key (`DecodedClaim.id`).
      claimId: string;
    }): Promise<void> => {
      if (isPending) {
        throw 'Already pending';
      }
      setPending(true);
      try {
        const claimEventKey = v2.EventKey.fromBinary(hexToBytes(claimId));
        const content = v2.Content.create({
          contentBody: {
            oneofKind: 'verificationVerify',
            verificationVerify: { claimEventKey },
          },
        });
        await client.contentManager.save(content);
        const event = await client.buildEvent(
          content,
          COLLECTION.VERIFICATIONS,
        );
        const signedEvent = await client.signEvent(event);
        await client.commitEvent(signedEvent, content);

        // Delivery to servers is best-effort — the verify is already saved
        // locally and will be pushed on the next sync if this fails.
        try {
          await client.sync(SyncStrategy.PARTIAL_PUSH);
        } catch (e) {
          console.warn('Failed to push verification to servers:', e);
        }

        // Refresh the claim's verifiers list and this verifier's inbox of
        // verification requests.
        invalidateQuery(client, ['verification-verifies', claimId]);
        if (identityKey) {
          invalidateQuery(client, [
            'targeted-verification-claims',
            identityKey,
          ]);
        }
      } finally {
        setPending(false);
      }
    },
  };
}
