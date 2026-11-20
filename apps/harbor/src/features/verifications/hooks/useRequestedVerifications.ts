import { labelMapFromSets } from '@/src/common/lib/polycentric-hooks/helpers';
import {
  Query,
  labelsFromTargetedVerificationClaimsResponse,
  v2,
} from '@polycentric/react-native';
import { useClaimBundleList } from './useClaimBundleList';

const parse = (data: ArrayBuffer) => ({
  bundles: v2.ListTargetedVerificationClaimsResponse.fromBinary(
    new Uint8Array(data),
  ).claimBundles,
  labelMap: labelMapFromSets(
    labelsFromTargetedVerificationClaimsResponse(data),
  ),
});

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
