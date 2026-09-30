import { FetchMode } from '@polycentric/react-native';
import {
  useVerifiedPlatformAccounts,
  type VerifiedPlatformAccount,
} from '../../verifications/hooks/useVerifiedPlatformAccounts';
import { useProfile } from './useProfile';

/**
 * The platform account `identity` chose to be known as, or null when none is
 * set or no trusted verifier bot has verified it.
 */
export function useKnownAs(
  identity: string | null | undefined,
): VerifiedPlatformAccount | null {
  const { knownAs } = useProfile(identity);
  const verifiedAccounts = useVerifiedPlatformAccounts(
    identity ?? undefined,
    !!knownAs,
    FetchMode.OfflineFirst,
  );
  return verifiedAccounts.find((a) => a.claimId === knownAs) ?? null;
}
