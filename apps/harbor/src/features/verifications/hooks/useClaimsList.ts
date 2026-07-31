import { Query, v2 } from '@polycentric/react-native';
import { useClaimBundleList } from './useClaimBundleList';

const parse = (bytes: Uint8Array) =>
  v2.ListVerificationClaimsResponse.fromBinary(bytes).claimBundles;

/**
 * List the verification claims created by an identity, newest first, each
 * carrying its verification status. Backed by the dedicated
 * `VerificationsService.ListVerificationClaims` RPC.
 */
export function useClaimsList(identity: string | undefined) {
  return useClaimBundleList(
    ['claims-list', identity ?? ''],
    new Query.ListVerificationClaims({ claimedByIdentity: identity ?? '' }),
    parse,
    !!identity,
  );
}
