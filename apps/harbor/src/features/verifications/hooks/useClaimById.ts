import {
  decodeBundle,
  eventKeyId,
  getKeyFingerprint,
  queryPayload,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { RefreshStrategy, useQuery } from '@/src/common/query/hooks/useQuery';
import {
  COLLECTION,
  Query,
  QueryData_Tags,
  type v2,
} from '@polycentric/react-native';
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
  identity: string;
  keyFingerprint: string;
  sequence: bigint;
  createdAt: bigint;
}

/**
 * Decode a verification claim from an event bundle. Returns null when the
 * bundle isn't a well-formed verification claim. All schema fields are kept
 * (empty ones decode to ""); presentation decides how to show them.
 */
export function decodeClaimBundle(bundle: v2.EventBundle): DecodedClaim | null {
  const decoded = decodeBundle(bundle, 'verificationClaim');
  if (!decoded) return null;
  try {
    const ev = decoded.event;
    if (!ev.key) return null;

    const verificationClaim = decoded.content;
    const schema = verificationClaim.schema?.schema;
    if (!schema) return null;

    const fields: ClaimField[] = schema.fields.map((field) => ({
      key: field.key,
      label: field.description,
      value: decodeFieldValue(
        field.kind,
        verificationClaim.fields.get(field.key) ?? new ArrayBuffer(0),
      ),
    }));

    return {
      id: eventKeyId(ev.key),
      schemaName: schema.name,
      fields,
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
 * Mirrors `usePostById`: `keyFingerprint` verifies the returned bundle matches
 * the expected signer.
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
    new Query.GetEvent({
      identity: identityId ?? '',
      collection: COLLECTION.VERIFICATIONS,
      sequence: sequence ?? 0n,
      signerKeyPrefix: keyFingerprint,
    }),
    undefined,
    enabled,
  );

  const claim = useMemo<DecodedClaim | null>(() => {
    if (!enabled) return null;
    const bundle = queryPayload(query.data, QueryData_Tags.Event)?.bundle;
    if (!bundle) return null;
    try {
      const decoded = decodeClaimBundle(bundle);
      if (!decoded) return null;
      // Verify the bundle matches the requested signer/sequence so a sequence
      // collision across signers doesn't render the wrong claim.
      if (
        decoded.keyFingerprint !== keyFingerprint ||
        decoded.sequence !== sequence
      ) {
        return null;
      }
      return decoded;
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
