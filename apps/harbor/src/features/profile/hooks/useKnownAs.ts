import { FetchMode } from '@polycentric/react-native';
import {
  useVerifiedPlatformAccounts,
  type VerifiedPlatformAccount,
} from '../../verifications/hooks/useVerifiedPlatformAccounts';
import { useProfile } from './useProfile';

export function useKnownAs(identity: string): {
  knownAs: VerifiedPlatformAccount | null;
  isLoading: boolean;
} {
  const { knownAs } = useProfile(identity);
  const claimId = knownAs?.kind === 'platformAccount' ? knownAs.claimId : null;
  const { verifiedAccounts, isLoading } = useVerifiedPlatformAccounts({
    identity,
    // Fetch only for users with knownAs set, at most once per users per session
    enabled: !!claimId,
    fetchMode: FetchMode.OfflineFirst,
  });

  if (!claimId) return { knownAs: null, isLoading: false };

  return {
    knownAs: verifiedAccounts.find((a) => a.claimId === claimId) ?? null,
    isLoading,
  };
}
