import { FetchMode } from '@polycentric/react-native';
import {
  useVerifiedPlatformAccounts,
  type VerifiedPlatformAccount,
} from '../../verifications/hooks/useVerifiedPlatformAccounts';
import { useProfile } from './useProfile';

export function useKnownAs(identity: string): {
  knownAs: VerifiedPlatformAccount | null;
  alias: string | null;
  isLoading: boolean;
} {
  const { knownAs, alias } = useProfile(identity);
  const { verifiedAccounts, isLoading } = useVerifiedPlatformAccounts({
    identity,
    // Fetch only for users with knownAs set, at most once per users per session
    enabled: !!knownAs,
    fetchMode: FetchMode.OfflineFirst,
  });

  if (!knownAs) return { knownAs: null, alias, isLoading: false };

  return {
    knownAs: verifiedAccounts.find((a) => a.claimId === knownAs) ?? null,
    alias,
    isLoading,
  };
}
