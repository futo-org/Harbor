import { DecodedClaim } from './useClaimById';

const EMPTY: DecodedClaim[] = [];
const noop = () => {};

/**
 * Claims by other identities that `identity` has verified. Stub until a
 * backend query for issued `VerificationVerify` attestations exists; shaped
 * like `useClaimsList` so the wiring doesn't change when it lands.
 */
export function useVerifiedClaims(_identity: string | undefined): {
  claims: DecodedClaim[];
  isLoading: boolean;
  refresh: () => void;
} {
  return { claims: EMPTY, isLoading: false, refresh: noop };
}
