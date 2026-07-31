import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import { useState } from 'react';
import type { Platform } from '../utils/platforms';
import { verifierApi } from '../utils/verifier-api';
import { oauthSignIn } from './useOAuthVerifyPlatformClaim';

/**
 * (Re-)verify an existing platform claim. Text platforms re-check the
 * profile; OAuth platforms run the sign-in again.
 */
export default function useRequestPlatformVerification() {
  const client = usePolycentric();
  const [isPending, setPending] = useState(false);

  return {
    isPending,
    submit: async ({
      platform,
      claimId,
    }: {
      platform: Platform;
      claimId: string;
    }): Promise<void> => {
      if (isPending) {
        throw 'Already pending';
      }
      setPending(true);
      try {
        const types = (await verifierApi.platformVerifiers()).get(
          platform.slug,
        );
        if (types?.has('text')) {
          await verifierApi.requestTextVerify(platform.slug, claimId);
        } else if (types?.has('oauth')) {
          const { server, token } = await oauthSignIn(platform);
          await verifierApi.requestOAuthVerify(
            server,
            platform.slug,
            claimId,
            token,
          );
        } else {
          throw new Error(`No verifier available for ${platform.name}`);
        }

        // The bot's verify is now on the servers; refresh the claim's status.
        invalidateQuery(client, ['verification-verifies', claimId]);
      } finally {
        setPending(false);
      }
    },
  };
}
