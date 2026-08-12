import { Query, v2 } from '@polycentric/react-native';
import { useClaimBundleList } from './useClaimBundleList';

const parse = (bytes: Uint8Array) =>
  v2.ListTargetedVerificationClaimsResponse.fromBinary(bytes).claimBundles;

/**
 * Claims other identities have asked `identity` to verify — the inbox of
 * verification requests, each claim carrying its verification status.
 * Backed by `VerificationsService.ListTargetedVerificationClaims`.
 */
export function useRequestedVerifications(
  identity: string | undefined,
  enabled = true,
) {
  return useClaimBundleList(
    ['targeted-verification-claims', identity ?? ''],
    new Query.ListTargetedVerificationClaims({
      targetIdentity: identity ?? '',
    }),
    parse,
    enabled && !!identity,
  );
}
