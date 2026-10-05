import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { useMemo } from 'react';
import { decodeClaimBundle } from '../../verifications/hooks/useClaimById';
import { useVerifierIdentities } from '../../verifications/hooks/useVerifierIdentities';
import {
  findPlatformAccount,
  findVerifiedPlatformAccount,
  type VerifiedPlatformAccount,
} from '../../verifications/hooks/useVerifiedPlatformAccounts';
import { decodeVerificationClaimBundle } from '../../verifications/utils/claim-status';
import { useProfile } from './useProfile';

export function useKnownAs(identity: string | null): {
  knownAs: VerifiedPlatformAccount | null;
  alias: string | null;
  isLoading: boolean;
} {
  const {
    knownAsClaimBundle,
    alias,
    isLoading: isProfileLoading,
    isResolved: isProfileResolved,
  } = useProfile(identity);
  const verifierBots = useVerifierIdentities();
  const { isCurrentIdentity } = useCurrentIdentity();
  const isOwnIdentity = isCurrentIdentity(identity);

  const knownAs = useMemo(() => {
    if (!knownAsClaimBundle) return null;
    let account: VerifiedPlatformAccount | null;
    if (isOwnIdentity) {
      // Your own claim is trusted as is: the bot's verifies aren't stored
      // locally, so on startup they're missing until a server responds.
      const claim =
        knownAsClaimBundle.claim && decodeClaimBundle(knownAsClaimBundle.claim);
      account = claim ? findPlatformAccount(claim) : null;
    } else {
      // Until the trusted bot list loads, verifies from anyone would count.
      if (!verifierBots) return null;
      const claim = decodeVerificationClaimBundle(
        knownAsClaimBundle,
        verifierBots,
      );
      account = claim && findVerifiedPlatformAccount(claim);
    }
    // "Other" accounts are arbitrary websites, so they can't be a known-as.
    return account && !account.platform.generic ? account : null;
  }, [knownAsClaimBundle, verifierBots, isOwnIdentity]);

  return {
    knownAs,
    alias,
    isLoading:
      // A refetch keeps showing the cached profile.
      (isProfileLoading && !isProfileResolved) ||
      (!!knownAsClaimBundle && !isOwnIdentity && !verifierBots),
  };
}
