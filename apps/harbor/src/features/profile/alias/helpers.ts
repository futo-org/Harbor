export function normalizeAlias(alias: string): string | null {
  return parseAlias(alias)?.normalizedAlias ?? null;
}

export function isIdentityKey(s: string): boolean {
  return /^[0-9a-f]+$/i.test(s);
}

/**
 * Parse `user@domain.com` or a bare `domain.com` (each with an optional
 * leading `@`) into its lowercased parts. The local part is limited to
 * letters, digits and `._-`; the domain must have two or more LDH labels.
 */
export function parseAlias(
  alias: string,
): { normalizedAlias: string; localPart: string; domain: string } | null {
  const normalizedAlias = alias.trim().replace(/^@/, '').toLowerCase();

  const parts = normalizedAlias.split('@');
  if (parts.length > 2) {
    return null;
  }
  // A bare domain points at the `*` entry of its polycentric.json.
  const [localPart, domain] = parts.length === 1 ? ['*', parts[0]] : parts;

  // Tighter than RFC 7565's `userpart`, which also permits `!$&'()*+,;=` and
  // %-encoding.
  if (parts.length === 2 && !/^[a-z0-9._-]+$/.test(localPart)) {
    return null;
  }

  const labels = domain.split('.');
  if (labels.length < 2 || !labels.every(isHostLabel)) {
    return null;
  }

  return { normalizedAlias, localPart, domain };
}

// A lowercased DNS label: 1+ of `[a-z0-9-]`, not starting or ending with a
// hyphen.
function isHostLabel(label: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label);
}
