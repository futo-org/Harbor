import { queryPayload } from '@/src/common/lib/polycentric-hooks/helpers';
import {
  Query,
  type QueryData,
  QueryData_Tags,
} from '@polycentric/react-native';
import { useClaimBundleList } from './useClaimBundleList';

const parse = (data: QueryData | undefined) =>
  queryPayload(data, QueryData_Tags.VerificationClaims)?.response.claimBundles;

/**
 * List the verification claims created by an identity, newest first, each
 * carrying its verification status. Backed by the dedicated
 * `VerificationsService.ListVerificationClaims` RPC.
 */
export function useClaimsList(identity: string | undefined, enabled = true) {
  return useClaimBundleList(
    ['claims-list', identity ?? ''],
    new Query.ListVerificationClaims({ claimedByIdentity: identity ?? '' }),
    parse,
    enabled && !!identity,
  );
}
