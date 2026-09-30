import type { FetchMode } from '@polycentric/react-native';
import { useMemo } from 'react';
import { getPlatformFromClaim, type Platform } from '../utils/platforms';
import { useClaimsList } from './useClaimsList';

export interface VerifiedPlatformAccount {
  claimId: string;
  platform: Platform;
  account: string;
}

export function useVerifiedPlatformAccounts(
  identity: string | undefined,
  enabled = true,
  fetchMode?: FetchMode,
): VerifiedPlatformAccount[] {
  const { claims, verifierBots } = useClaimsList(identity, enabled, fetchMode);

  return useMemo(() => {
    // Until the bot set loads, every verifier counts toward the status.
    if (!verifierBots) return [];
    return claims.flatMap((claim) => {
      if (claim.status.verifiedCount === 0) return [];
      const platform = getPlatformFromClaim(claim.schemaName, claim.fields);
      const account = claim.fields.find((f) => f.key === 'account')?.value;
      if (!platform || !account) return [];
      return [{ claimId: claim.id, platform, account }];
    });
  }, [claims, verifierBots]);
}
