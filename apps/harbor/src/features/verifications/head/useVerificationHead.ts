import { Routes } from '@/src/common/constants';
import type { Head } from '@/src/common/lib/head';
import { useAuthoredHead } from '@/src/features/profile/head/useAuthoredHead';
import { verificationHead } from './index';
import type { DecodedClaim } from '@/src/features/verifications/hooks/useClaimById';

/** The head of the claim the screen has loaded. Null while loading */
export function useVerificationHead(
  claim: DecodedClaim | null,
  verifierCount: number,
  isLoading: boolean,
): Head | null {
  return useAuthoredHead('Claim', claim, isLoading, (author, loaded) =>
    verificationHead({
      author,
      path: Routes.tabs.verification(
        loaded.identity,
        loaded.keyFingerprint,
        loaded.sequence.toString(),
      ),
      claim: loaded,
      verifierCount,
    }),
  );
}
