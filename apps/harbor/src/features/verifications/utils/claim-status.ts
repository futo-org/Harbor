import { v2 } from '@polycentric/react-native';
import { type DecodedClaim, decodeClaimBundle } from '../hooks/useClaimById';
import { PLATFORM_SCHEMA_NAME } from './platforms';

export interface ClaimVerifier {
  identity: string;
  verified: boolean;
}

export interface ClaimVerificationStatus {
  /** Everyone asked to verify; only verifier bots for platform claims. */
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
    } catch {}
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
    } catch {}
  }
  return out;
}

/**
 * Requested identities, flagged verified when they have. A verify only
 * counts when it was requested via a VerificationTarget.
 *
 * Platform claims are machine checked, so pass `verifierBots` for them:
 * only those identities count — others are dropped, and a bot's verify
 * counts even without a request. Undefined while the bot set loads, which
 * leaves the rows unfiltered.
 */
export function combineVerifiers(
  requested: string[],
  verifiedBy: Set<string>,
  verifierBots?: Set<string>,
): ClaimVerifier[] {
  if (!verifierBots) {
    return requested.map((identity) => ({
      identity,
      verified: verifiedBy.has(identity),
    }));
  }
  const rows = requested
    .filter((identity) => verifierBots.has(identity))
    .map((identity) => ({ identity, verified: verifiedBy.has(identity) }));
  const seen = new Set(rows.map((row) => row.identity));
  for (const identity of verifiedBy) {
    if (verifierBots.has(identity) && !seen.has(identity)) {
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
  verifierBots?: Set<string>,
): ClaimWithStatus | null {
  if (!group.claim) return null;
  const claim = decodeClaimBundle(group.claim);
  if (!claim) return null;
  const isPlatform = claim.schemaName === PLATFORM_SCHEMA_NAME;
  const verifiers = combineVerifiers(
    decodeTargetIdentities(group.targets),
    decodeVerifierIdentities(group.verifies),
    isPlatform ? verifierBots : undefined,
  );
  return { ...claim, status: statusOf(verifiers) };
}
