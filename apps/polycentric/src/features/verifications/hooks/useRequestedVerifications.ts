import { DecodedClaim } from './useClaimById';

const EMPTY: DecodedClaim[] = [];
const noop = () => {};

/**
 * Claims other identities have asked the current identity to verify
 * (via `VerificationTarget` targeting).
 *
 * The backend has no query for claims targeting an identity yet —
 * `VerificationsService` only exposes `ListClaims` by creator — so this
 * returns an empty list until that RPC exists. The hook keeps the same shape
 * as `useClaimsList` so the list wiring doesn't change when it lands.
 */
export function useRequestedVerifications(_identity: string | undefined): {
  claims: DecodedClaim[];
  isLoading: boolean;
  refresh: () => void;
} {
  return { claims: EMPTY, isLoading: false, refresh: noop };
}
