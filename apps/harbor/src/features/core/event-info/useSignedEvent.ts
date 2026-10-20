import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { bytesToHex } from '@/src/common/lib/polycentric-hooks/helpers';
import { v2 } from '@polycentric/react-native';
import { useCallback, useEffect, useRef, useState } from 'react';

/** No sequence means the latest event. */
export type EventLookup = {
  identity: string;
  collection: number;
  sequence?: bigint;
  signedBy?: v2.PublicKey;
};

export type EventSource = { signedEvent: v2.SignedEvent } | EventLookup;

export type SignedEventResult = {
  bundle: v2.EventBundle | null;
  signedEvent: v2.SignedEvent | null;
  isLoading: boolean;
  refetch: () => Promise<v2.EventBundle | null>;
};

export function lookupQuery(lookup: EventLookup) {
  return {
    identity: lookup.identity,
    collection: lookup.collection,
    signedBy: lookup.signedBy ?? null,
    sequenceGt: lookup.sequence != null ? lookup.sequence - 1n : null,
    sequenceLt: lookup.sequence != null ? lookup.sequence + 1n : null,
  };
}

export function lookupKey(lookup: EventLookup): string {
  return [
    lookup.identity,
    lookup.collection,
    lookup.sequence?.toString() ?? 'latest',
    lookup.signedBy ? bytesToHex(lookup.signedBy.key) : '',
  ].join('/');
}

export function tryOrNull<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

export function decodeEvent(
  signedEvent: v2.SignedEvent | null | undefined,
): v2.Event | null {
  if (!signedEvent) return null;
  const event = tryOrNull(() => v2.Event.fromBinary(signedEvent.eventBytes));
  return event?.key ? event : null;
}

// Events are immutable, so exact-sequence hits are kept for instant navigation.
const found = new Map<string, v2.EventBundle>();

export function useSignedEvent(source: EventSource | null): SignedEventResult {
  const client = usePolycentric();
  const [fetched, setFetched] = useState<{
    key: string;
    bundle: v2.EventBundle | null;
  } | null>(null);

  const inline = source && 'signedEvent' in source ? source.signedEvent : null;
  const lookup = source && !('signedEvent' in source) ? source : null;
  // Callers pass fresh objects, so key on the primitives and read via a ref.
  const key = lookup ? lookupKey(lookup) : null;
  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;

  const fetch = useCallback(async () => {
    const params = lookupRef.current;
    if (!key || !params) return null;
    const bundles = await client.listEvents(lookupQuery(params));
    const bundle = pickEvent(bundles, params.sequence);
    if (bundle && params.sequence != null) found.set(key, bundle);
    return bundle;
  }, [client, key]);

  useEffect(() => {
    if (!key || found.has(key)) return;
    let cancelled = false;
    fetch()
      .catch(() => null)
      .then((bundle) => {
        if (!cancelled) setFetched({ key, bundle });
      });
    return () => {
      cancelled = true;
    };
  }, [key, fetch]);

  const refetch = useCallback(async () => {
    const bundle = await fetch().catch(() => null);
    if (key) setFetched({ key, bundle });
    return bundle;
  }, [key, fetch]);

  const result = (bundle: v2.EventBundle | null, isLoading = false) => ({
    bundle,
    signedEvent: bundle?.signedEvent ?? null,
    isLoading,
    refetch,
  });

  if (inline) return { ...result(null), signedEvent: inline };
  if (!key) return result(null);
  const cached = found.get(key);
  if (cached) return result(cached);
  if (fetched?.key !== key) return result(null, true);
  return result(fetched.bundle);
}

function pickEvent(
  bundles: v2.EventBundle[],
  sequence: bigint | undefined,
): v2.EventBundle | null {
  let best: { bundle: v2.EventBundle; sequence: bigint } | null = null;
  for (const bundle of bundles) {
    const seq = decodeEvent(bundle.signedEvent)?.key?.sequence;
    if (seq == null) continue;
    if (sequence != null) {
      if (seq === sequence) return bundle;
      continue;
    }
    if (!best || seq > best.sequence) best = { bundle, sequence: seq };
  }
  return best?.bundle ?? null;
}
