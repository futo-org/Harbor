export type TextSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; url: string }
  | { type: 'alias'; value: string; alias: string }
  | { type: 'identity'; value: string; identity: string };

// Common TLDs accepted for bare (scheme-less, non-www) domains. Keeping
// this curated avoids turning things like "node.js" or "e.g." into links.
const TLD =
  '(?:com|org|net|edu|gov|mil|io|dev|app|co|me|gg|xyz|info|biz|tv|news|social|link|so|ai|sh|to|fm|fyi|page|site|blog|uk|us|ca|de|fr|nl|eu|es|it|jp|au|in|br|ru|ch|se|no|pl)';

// A dotted hostname whose final label is a known TLD.
const DOMAIN = `(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+${TLD}`;

// A polycentric identity: exactly 64 hex chars (a SHA-256 hash). The lookahead
// rejects a longer hex run rather than matching a 64-char prefix of it.
const IDENTITY = '[0-9a-fA-F]{64}(?![0-9a-fA-F])';

// Matches, in order: alias mentions (`@user@domain.tld`), identity mentions
// (`@<64-hex>`), http(s) URLs, `www.` domains, and bare domains that end in a
// known TLD (optionally followed by a path/query). Mention alternatives come
// first so `@user@domain.com` is taken whole instead of the bare domain inside.
const LINK_REGEX = new RegExp(
  [
    `@[a-z0-9._-]+@${DOMAIN}`,
    `@${IDENTITY}`,
    'https?:\\/\\/[^\\s]+',
    'www\\.[^\\s]+',
    `${DOMAIN}(?:\\/[^\\s]*)?`,
  ].join('|'),
  'gi',
);

// Punctuation that commonly trails a URL in prose but isn't part of it.
const TRAILING_PUNCT = /[.,!?;:'")\]}]+$/;

/**
 * Splits `text` into plain-text, link, and mention segments. Detects alias
 * mentions (`@user@domain.com`), identity mentions (`@<64-hex>`), http(s) URLs,
 * `www.` domains, and bare domains with a known TLD. Trailing sentence
 * punctuation is excluded, and a bare domain preceded by `@` (an email's domain
 * part) is left as plain text.
 */
export function parseTextLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  LINK_REGEX.lastIndex = 0;
  while ((match = LINK_REGEX.exec(text)) !== null) {
    const start = match.index;
    let raw = match[0];
    const isMention = raw[0] === '@';

    // Skip an email's domain part; mentions start with `@` themselves.
    if (!isMention && start > 0 && text[start - 1] === '@') continue;

    const trail = raw.match(TRAILING_PUNCT)?.[0] ?? '';
    if (trail) raw = raw.slice(0, raw.length - trail.length);
    if (!raw) continue;

    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start) });
    }

    if (isMention) {
      // Drop the leading `@` for routing; keep it in `value` for display. A
      // second `@` distinguishes an alias (`@user@domain`) from an identity.
      const body = raw.slice(1);
      if (body.includes('@')) {
        segments.push({ type: 'alias', value: raw, alias: body });
      } else {
        segments.push({ type: 'identity', value: raw, identity: body });
      }
    } else {
      const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      segments.push({ type: 'link', value: raw, url });
    }

    // Resume scanning after the match, leaving any trailing punctuation
    // to be picked up as plain text.
    lastIndex = start + raw.length;
    LINK_REGEX.lastIndex = lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}
