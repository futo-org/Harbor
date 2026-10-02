import { useMemo } from 'react';
import { useVerifierIdentities } from '../../verifications/hooks/useVerifierIdentities';
import {
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
  const { knownAsClaimBundle, alias } = useProfile(identity);
  const verifierBots = useVerifierIdentities();

  const knownAs = useMemo(() => {
    // Until the trusted bot list loads, verifies from anyone would count.
    if (!knownAsClaimBundle || !verifierBots) return null;
    const claim = decodeVerificationClaimBundle(
      knownAsClaimBundle,
      verifierBots,
    );
    const account = claim && findVerifiedPlatformAccount(claim);
    // "Other" accounts are arbitrary websites, so they can't be a known-as.
    return account && !account.platform.generic ? account : null;
  }, [knownAsClaimBundle, verifierBots]);

  return {
    knownAs,
    alias,
    isLoading: !!knownAsClaimBundle && !verifierBots,
  };
}
