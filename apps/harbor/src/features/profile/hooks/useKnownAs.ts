import { FetchMode } from '@polycentric/react-native';
import { useMemo } from 'react';
import { useClaimsList } from '../../verifications/hooks/useClaimsList';
import {
  getPlatformFromClaim,
  type Platform,
} from '../../verifications/utils/platforms';
import { useProfile } from './useProfile';

export interface KnownAs {
  platform: Platform;
  account: string;
}

/**
 * The platform account `identity` chose to be known as, or null when none is
 * set or no trusted verifier bot has verified it.
 */
export function useKnownAs(
  identity: string | null | undefined,
): KnownAs | null {
  const { knownAs } = useProfile(identity);
  const { claims, verifierBots } = useClaimsList(
    identity ?? undefined,
    !!knownAs,
    FetchMode.OfflineFirst,
  );

  return useMemo(() => {
    // Until the bot set loads, every verifier counts toward the status.
    if (!knownAs || !verifierBots) return null;
    const claim = claims.find((c) => c.id === knownAs);
    if (!claim || claim.status.verifiedCount === 0) return null;
    const platform = getPlatformFromClaim(claim.schemaName, claim.fields);
    const account = claim.fields.find((f) => f.key === 'account')?.value;
    if (!platform || !account) return null;
    return { platform, account };
  }, [knownAs, verifierBots, claims]);
}
