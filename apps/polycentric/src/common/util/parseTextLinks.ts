export type TextSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; url: string };

// Common TLDs accepted for bare (scheme-less, non-www) domains. Keeping
// this curated avoids turning things like "node.js" or "e.g." into links.
const TLD =
  '(?:com|org|net|edu|gov|mil|io|dev|app|co|me|gg|xyz|info|biz|tv|news|social|link|so|ai|sh|to|fm|fyi|page|site|blog|uk|us|ca|de|fr|nl|eu|es|it|jp|au|in|br|ru|ch|se|no|pl)';

// Matches, in order: http(s) URLs, `www.` domains, and bare domains that
// end in a known TLD (optionally followed by a path/query).
const LINK_REGEX = new RegExp(
  [
    'https?:\\/\\/[^\\s]+',
    'www\\.[^\\s]+',
    `(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+${TLD}(?:\\/[^\\s]*)?`,
  ].join('|'),
  'gi',
);

// Punctuation that commonly trails a URL in prose but isn't part of it.
const TRAILING_PUNCT = /[.,!?;:'")\]}]+$/;

/**
 * Splits `text` into plain-text and link segments. Detects http(s) URLs,
 * `www.` domains, and bare domains with a known TLD. Trailing sentence
 * punctuation is excluded from links, and `@`-prefixed matches (e.g. the
 * domain part of an email) are left as plain text.
 */
export function parseTextLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  LINK_REGEX.lastIndex = 0;
  while ((match = LINK_REGEX.exec(text)) !== null) {
    const start = match.index;

    // Skip emails (and other `@`-prefixed matches).
    if (start > 0 && text[start - 1] === '@') continue;

    let raw = match[0];
    const trail = raw.match(TRAILING_PUNCT)?.[0] ?? '';
    if (trail) raw = raw.slice(0, raw.length - trail.length);
    if (!raw) continue;

    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start) });
    }

    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    segments.push({ type: 'link', value: raw, url });

    // Resume scanning after the link, leaving any trailing punctuation
    // to be picked up as plain text.
    lastIndex = start + raw.length;
    LINK_REGEX.lastIndex = lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}
