/**
 * WebFinger (RFC 7033) resolution: maps an `acct` handle like `user@domain.com`
 * to the polycentric identity it points at.
 */

// JRD `properties` key carrying the polycentric identity.
export const WEBFINGER_PROP_IDENTITY = 'https://polycentric.io/identity';

/** Give up on a slow/unresponsive domain rather than hang the resolver. */
const RESOLVE_TIMEOUT_MS = 10_000;

/** A polycentric identity key string is `<keyType>_<hexBytes>` (publicKeyToString). */
const IDENTITY_KEY_PATTERN = /^\d+_[0-9a-fA-F]+$/;

interface Jrd {
  subject?: string;
  // RFC 7033: property values are a string or null.
  properties?: Record<string, string | null>;
}

// Conservative allow-list for a handle's local part — deliberately tighter than
// RFC 7565's `userpart` (which also permits `!$&'()*+,;=` and %-encoding):
// letters, digits, dot, underscore, hyphen.
const LOCAL_CHARS = new Set(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-',
);

/** A DNS label: 1+ of `[A-Za-z0-9-]`, not starting or ending with a hyphen. */
function isHostLabel(label: string): boolean {
  if (label.length === 0 || label.startsWith('-') || label.endsWith('-')) {
    return false;
  }
  return Array.from(label).every(
    (c) =>
      (c >= 'a' && c <= 'z') ||
      (c >= 'A' && c <= 'Z') ||
      (c >= '0' && c <= '9') ||
      c === '-',
  );
}

/**
 * Parse a handle into its `acct` form and domain. Accepts `user@domain.com`
 * with an optional leading `@`, validated with conservative allow-lists: the
 * local part is limited to letters/digits/`._-`, and the domain must be a
 * dotted hostname (two or more LDH labels). Returns null otherwise.
 */
function parseHandle(handle: string): { acct: string; domain: string } | null {
  // Trim, then drop a single optional leading '@' (e.g. "@user@domain.com").
  let acct = handle.trim();
  if (acct.startsWith('@')) {
    acct = acct.slice(1);
  }

  // Exactly one '@', with a non-empty local part before it.
  const at = acct.indexOf('@');
  if (at <= 0 || acct.indexOf('@', at + 1) !== -1) {
    return null;
  }
  const local = acct.slice(0, at);
  const domain = acct.slice(at + 1);

  // Local part: every character must be in the conservative allow-list.
  if (!Array.from(local).every((c) => LOCAL_CHARS.has(c))) {
    return null;
  }

  // Domain: a dotted hostname — two or more non-empty LDH labels.
  const labels = domain.split('.');
  if (labels.length < 2 || !labels.every(isHostLabel)) {
    return null;
  }

  return { acct, domain };
}

/**
 * Resolve a WebFinger handle (`user@domain.com`) to a polycentric identity.
 *
 * Returns null when the handle is malformed, the lookup fails (network error,
 * timeout, non-2xx, unparseable body), or the domain's WebFinger document
 * carries no polycentric identity property.
 */
export async function resolveWebFinger(handle: string): Promise<string | null> {
  const parsed = parseHandle(handle);
  if (!parsed) {
    return null;
  }

  const url =
    `https://${parsed.domain}/.well-known/webfinger` +
    `?resource=${encodeURIComponent(`acct:${parsed.acct}`)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);

  let jrd: Jrd;
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/jrd+json, application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      // A 404 here just means the domain doesn't know this account — expected,
      // not worth a warning.
      return null;
    }
    jrd = (await response.json()) as Jrd;
  } catch (error) {
    // Network error / timeout / unparseable body: surface for debugging rather
    // than swallowing silently, but still resolve to "not found".
    console.warn(`webfinger lookup failed for ${parsed.acct}:`, error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }

  const identity = jrd.properties?.[WEBFINGER_PROP_IDENTITY];
  if (!identity || !IDENTITY_KEY_PATTERN.test(identity)) {
    return null;
  }

  return identity;
}
