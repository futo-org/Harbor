import { HARBOR_APP_URL } from '@/src/common/constants';
import type { Href } from 'expo-router';
import {
  ATTENDANCE_CLAIM_TYPE,
  CLAIM_TYPES,
  type ClaimType,
} from '../../../utils/forms';

export const CLAIM_LINK_PATH = '/verifications/create';

/** Query params of a claim link. The rest are the claim type's fields */
export const CLAIM_LINK_PARAM = {
  claim: 'claim',
  event: 'event',
  from: 'from',
} as const;

const MAX_VALUE_LENGTH = 2000;
const IDENTITY_PATTERN = /^[0-9a-f]{64}$/i;
const EVENT_PATTERN = /^([0-9a-f]{64})\/([0-9a-z]+)\/(\d{1,19})$/i;

export type ClaimLinkEvent = {
  identity: string;
  keyFingerprint: string;
  sequence: bigint;
};

export type ClaimLink = {
  claimType: ClaimType;
  /** Values for the form's inputs */
  values: Record<string, string>;
  /** The event an attendance claim is about */
  event?: ClaimLinkEvent;
  /** Identity to ask for verification once the claim is made */
  requestFrom?: string;
};

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** Reads a claim link's query params. Null if they don't describe a claim */
export function parseClaimLink(params: Params): ClaimLink | null {
  const name = first(params[CLAIM_LINK_PARAM.claim])?.toLowerCase();
  if (!name) return null;

  const claimType = CLAIM_TYPES.find(
    (type) => type.name.toLowerCase() === name,
  );
  // Platform claims are a flow of their own, with nothing to prefill
  if (!claimType || claimType.platform) return null;

  const from = first(params[CLAIM_LINK_PARAM.from]);
  const requestFrom = from && IDENTITY_PATTERN.test(from) ? from : undefined;

  const values: Record<string, string> = {};

  for (const field of claimType.fields) {
    // Hidden fields come from the event, never from the link
    if (field.hidden) continue;

    const value = first(params[field.key])?.trim();
    if (value) values[field.key] = value.slice(0, MAX_VALUE_LENGTH);
  }

  if (!claimType.calendarEvent) return { claimType, values, requestFrom };

  const match = EVENT_PATTERN.exec(first(params[CLAIM_LINK_PARAM.event]) ?? '');
  if (!match) return null;

  return {
    claimType,
    values,
    requestFrom,
    event: {
      identity: match[1],
      keyFingerprint: match[2],
      sequence: BigInt(match[3]),
    },
  };
}

/** Reads a scanned or pasted claim link. Null if it isn't one */
export function parseClaimLinkUrl(url: string): ClaimLink | null {
  try {
    const { searchParams } = new URL(url.trim());

    return parseClaimLink(Object.fromEntries(searchParams.entries()));
  } catch {
    return null;
  }
}

/** Link that opens the claim form for a claim type, prefilled */
export function claimLink(
  claimType: ClaimType,
  values: Record<string, string>,
): string {
  const params = new URLSearchParams({
    [CLAIM_LINK_PARAM.claim]: claimType.name,
  });

  for (const field of claimType.fields) {
    const value = values[field.key]?.trim();
    if (!field.hidden && value) params.set(field.key, value);
  }

  return `${HARBOR_APP_URL}${CLAIM_LINK_PATH}?${params.toString()}`;
}

/** Link that opens an attendance claim for the event */
export function attendanceClaimLink(
  event: Pick<ClaimLinkEvent, 'identity' | 'keyFingerprint'> & {
    sequence: string | bigint;
  },
): string {
  const ref = `${event.identity}/${event.keyFingerprint}/${event.sequence}`;

  // Slashes are fine in a query, and unescaped they keep the QR code smaller
  return `${HARBOR_APP_URL}${CLAIM_LINK_PATH}?${CLAIM_LINK_PARAM.claim}=${ATTENDANCE_CLAIM_TYPE.name}&${CLAIM_LINK_PARAM.event}=${ref}`;
}

/** The in-app route of a claim link */
export function claimLinkRoute(link: string): Href {
  return link.slice(HARBOR_APP_URL.length) as Href;
}
