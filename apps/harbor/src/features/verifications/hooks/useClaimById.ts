import {
  eventKeyId,
  getKeyFingerprint,
  labelMapFromSets,
  type PostLabel,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import {
  COLLECTION,
  Query,
  labelsFromGetVerificationClaimResponse,
  v2,
} from '@polycentric/react-native-sdk';
import { useMemo } from 'react';
import { decodeFieldValue } from '../utils/schemas';

export interface ClaimField {
  key: string;
  label: string;
  value: string;
}

export interface DecodedClaim {
  // Hex-encoded event key, used to report or delete the claim.
  id: string;
  schemaName: string;
  fields: ClaimField[];
  images: v2.ImageSet[];
  identity: string;
  keyFingerprint: string;
  sequence: bigint;
  createdAt: bigint;
  labels?: PostLabel[];
}

/**
 * Decode a verification claim from an event bundle. Returns null when the
 * bundle isn't a well-formed verification claim. All schema fields are kept
 * (empty ones decode to ""); presentation decides how to show them.
 */
export function decodeClaimBundle(bundle: v2.EventBundle): DecodedClaim | null {
  if (!bundle.signedEvent || !bundle.serializedContent?.contentBytes) {
    return null;
  }
  try {
    const ev = v2.Event.fromBinary(bundle.signedEvent.eventBytes);
    if (!ev.key) return null;

    const content = v2.Content.fromBinary(
      bundle.serializedContent.contentBytes,
    );
    if (content.contentBody.oneofKind !== 'verificationClaim') return null;

    const verificationClaim = content.contentBody.verificationClaim;
    const schemaBytes = verificationClaim.schema?.schemaBytes;
    if (!schemaBytes) return null;
    const schema = v2.VerificationSchema.fromBinary(schemaBytes);

    const fields: ClaimField[] = schema.fields.map((field) => ({
      key: field.key,
      label: field.description,
      value: decodeFieldValue(field.kind, verificationClaim.fields[field.key]),
    }));

    return {
      id: eventKeyId(ev.key),
      schemaName: schema.name,
      fields,
      images: verificationClaim.images,
      identity: ev.key.identity,
      keyFingerprint: getKeyFingerprint(ev.key.signedBy) ?? '',
      sequence: ev.key.sequence,
      createdAt: ev.createdAt,
    };
  } catch {
    return null;
  }
}

/**
 * Load a single verification claim by its (identity, sequence) route params.
 * Mirrors `usePostById`: `keyFingerprint` picks the expected signer's claim.
 */
export function useClaimById(
  identityId: string | undefined,
  keyFingerprint: string | undefined,
  sequence: bigint | undefined,
): {
  claim: DecodedClaim | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  refresh: () => void;
} {
  const enabled = !!identityId && sequence != null && !!keyFingerprint;

  const query = useQuery(
    [
      'event',
      String(COLLECTION.VERIFICATIONS),
      identityId ?? '',
      keyFingerprint ?? '',
      sequence?.toString() ?? '',
    ],
    new Query.GetVerificationClaim({
      identity: identityId ?? '',
      sequence: sequence ?? 0n,
      signerKeyPrefix: keyFingerprint,
    }),
    undefined,
    enabled,
  );

  const claim = useMemo<DecodedClaim | null>(() => {
    if (!enabled) return null;
    if (!query.data || query.data.byteLength === 0) return null;
    try {
      const response = v2.GetVerificationClaimResponse.fromBinary(
        new Uint8Array(query.data),
      );
      const claim = pickClaim(response, keyFingerprint, sequence);
      if (!claim) return null;
      const labelMap = labelMapFromSets(
        labelsFromGetVerificationClaimResponse(query.data),
      );
      return { ...claim, labels: labelMap.get(claim.id) };
    } catch {
      return null;
    }
  }, [enabled, query.data, keyFingerprint, sequence]);

  return {
    claim,
    isLoading: query.isLoading,
    isRefreshing: query.hasPendingRefresh,
    error: query.error ? new Error(query.error) : null,
    refresh: () => query.refresh(RefreshStrategy.Lazy),
  };
}

/**
 * Pick the claim matching the route's signer and sequence, so a sequence
 * collision across signers doesn't render the wrong claim.
 */
export function pickClaim(
  response: v2.GetVerificationClaimResponse,
  keyFingerprint: string | undefined,
  sequence: bigint | undefined,
): DecodedClaim | null {
  for (const bundle of response.candidates) {
    const claim = decodeClaimBundle(bundle);
    if (!claim) continue;
    if (
      claim.keyFingerprint === keyFingerprint &&
      claim.sequence === sequence
    ) {
      return claim;
    }
  }
  return null;
}
