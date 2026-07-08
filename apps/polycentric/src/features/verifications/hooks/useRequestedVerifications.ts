import { DecodedClaim } from './useClaimById';

const EMPTY: DecodedClaim[] = [];
const noop = () => {};

/**
 * Claims other identities have asked the current identity to verify. Stub
 * until a backend query for claims targeting an identity exists; shaped like
 * `useClaimsList` so the wiring doesn't change when it lands.
 */
export function useRequestedVerifications(_identity: string | undefined): {
  claims: DecodedClaim[];
  isLoading: boolean;
  refresh: () => void;
} {
  return { claims: EMPTY, isLoading: false, refresh: noop };
}
