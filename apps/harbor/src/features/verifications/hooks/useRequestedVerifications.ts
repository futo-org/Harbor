import { queryPayload } from '@/src/common/lib/polycentric-hooks/helpers';
import {
  Query,
  type QueryData,
  QueryData_Tags,
} from '@polycentric/react-native';
import { useClaimBundleList } from './useClaimBundleList';

const parse = (data: QueryData | undefined) =>
  queryPayload(data, QueryData_Tags.TargetedVerificationClaims)?.response
    .claimBundles;

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
