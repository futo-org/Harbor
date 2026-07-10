import { v2 } from '@polycentric/react-native';
import { DecodedClaim, decodeClaimBundle } from '../hooks/useClaimById';

export interface ClaimVerifier {
  identity: string;
  verified: boolean;
}

export interface ClaimVerificationStatus {
  /** Everyone asked to verify, then verify authors who weren’t asked. */
  verifiers: ClaimVerifier[];
  verifiedCount: number;
  totalCount: number;
}

export type ClaimWithStatus = DecodedClaim & {
  status: ClaimVerificationStatus;
};

/** Identities asked to verify, in request order, deduped. */
export function decodeTargetIdentities(bundles: v2.EventBundle[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const bundle of bundles) {
    if (!bundle.serializedContent?.contentBytes) continue;
    try {
      const content = v2.Content.fromBinary(
        bundle.serializedContent.contentBytes,
      );
      if (content.contentBody.oneofKind !== 'verificationTarget') continue;
      for (const identity of content.contentBody.verificationTarget
        .targetIdentities) {
        if (identity && !seen.has(identity)) {
          seen.add(identity);
          out.push(identity);
        }
      }
    } catch {
      continue;
    }
  }
  return out;
}

/** Identities of the verifiers — who has verified the claim. */
export function decodeVerifierIdentities(
  bundles: v2.EventBundle[],
): Set<string> {
  const out = new Set<string>();
  for (const bundle of bundles) {
    if (!bundle.signedEvent) continue;
    try {
      const event = v2.Event.fromBinary(bundle.signedEvent.eventBytes);
      if (event.key?.identity) out.add(event.key.identity);
    } catch {
      continue;
    }
  }
  return out;
}

/** Requested identities first, then verify authors who were never asked. */
export function combineVerifiers(
  requested: string[],
  verifiedBy: Set<string>,
): ClaimVerifier[] {
  const requestedSet = new Set(requested);
  const rows = requested.map((identity) => ({
    identity,
    verified: verifiedBy.has(identity),
  }));
  for (const identity of verifiedBy) {
    if (!requestedSet.has(identity)) {
      rows.push({ identity, verified: true });
    }
  }
  return rows;
}

export function statusOf(verifiers: ClaimVerifier[]): ClaimVerificationStatus {
  return {
    verifiers,
    verifiedCount: verifiers.filter((v) => v.verified).length,
    totalCount: verifiers.length,
  };
}

/** Decode one response group into a claim with its verification status. */
export function decodeVerificationClaimBundle(
  group: v2.VerificationClaimBundle,
): ClaimWithStatus | null {
  if (!group.claim) return null;
  const claim = decodeClaimBundle(group.claim);
  if (!claim) return null;
  const verifiers = combineVerifiers(
    decodeTargetIdentities(group.targets),
    decodeVerifierIdentities(group.verifies),
  );
  return { ...claim, status: statusOf(verifiers) };
}
