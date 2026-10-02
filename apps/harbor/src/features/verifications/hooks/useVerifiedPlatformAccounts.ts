import type { FetchMode } from '@polycentric/react-native';
import { useMemo } from 'react';
import type { ClaimWithStatus } from '../utils/claim-status';
import { getPlatformFromClaim, type Platform } from '../utils/platforms';
import { useClaimsList } from './useClaimsList';

export interface VerifiedPlatformAccount {
  claimId: string;
  platform: Platform;
  account: string;
}

export function useVerifiedPlatformAccounts({
  identity,
  enabled = true,
  fetchMode,
}: {
  identity: string | undefined;
  enabled?: boolean;
  fetchMode?: FetchMode;
}): { verifiedAccounts: VerifiedPlatformAccount[]; isLoading: boolean } {
  const {
    claims,
    verifierBots,
    isLoading: isClaimsLoading,
  } = useClaimsList(identity, enabled, fetchMode);
  const isLoading = isClaimsLoading || !verifierBots;

  const verifiedAccounts = useMemo(() => {
    // Until the trusted bot list loads, claim status counts vouches from anyone,
    // so a claim can look verified when no trusted bot verified it.
    if (!verifierBots) return [];
    return claims.flatMap((claim) => findVerifiedPlatformAccount(claim) ?? []);
  }, [claims, verifierBots]);

  return { verifiedAccounts, isLoading };
}

/** The platform account `claim` proves, or null when it isn't verified. */
export function findVerifiedPlatformAccount(
  claim: ClaimWithStatus,
): VerifiedPlatformAccount | null {
  if (claim.status.verifiedCount === 0) return null;
  const platform = getPlatformFromClaim(claim.schemaName, claim.fields);
  const account = claim.fields.find((f) => f.key === 'account')?.value;
  if (!platform || !account) return null;
  return { claimId: claim.id, platform, account };
}
