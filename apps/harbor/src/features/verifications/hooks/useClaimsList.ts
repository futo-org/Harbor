import { labelMapFromSets } from '@/src/common/lib/polycentric-hooks/helpers';
import { useOmitLabels } from '@/src/common/settings/useOmitLabels';
import {
  Query,
  labelsFromVerificationClaimsResponse,
  v2,
} from '@polycentric/react-native-sdk';
import { useClaimBundleList } from './useClaimBundleList';

const parse = (data: ArrayBuffer) => ({
  bundles: v2.ListVerificationClaimsResponse.fromBinary(new Uint8Array(data))
    .claimBundles,
  labelMap: labelMapFromSets(labelsFromVerificationClaimsResponse(data)),
});

/**
 * List the verification claims created by an identity, newest first, each
 * carrying its verification status. Backed by the dedicated
 * `VerificationsService.ListVerificationClaims` RPC.
 */
export function useClaimsList(identity: string | undefined, enabled = true) {
  const omitLabels = useOmitLabels();
  return useClaimBundleList(
    ['claims-list', identity ?? ''],
    new Query.ListVerificationClaims({
      claimedByIdentity: identity ?? '',
      omitLabels,
    }),
    parse,
    enabled && !!identity,
  );
}
