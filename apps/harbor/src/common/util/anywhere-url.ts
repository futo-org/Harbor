const HTTP_PREFIX = 'http:';
/**
 * Stands for an empty path segment (`a//b`, or after a trailing slash),
 * which the router would drop.
 */
const EMPTY_SEGMENT = ' ';

/** The router decodes route params twice, so `%` is escaped once more. */
function encodeSegment(text: string): string {
  return encodeURIComponent(text.replace(/%/g, '%25'));
}

/** Undoes `encodeSegment` for a segment read straight from a path. */
export function decodeAnywhereSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(decodeURIComponent(segment));
  } catch {
    return undefined;
  }
}

/** A page's address as `<domain>/<safe-path>`; http is marked `http:`. */
export function encodeAnywhereUrl(url: string): string {
  const [, scheme, host, rest] = url.match(/^(https?):\/\/([^/?#]*)(.*)$/) ?? [
    '',
    'https',
    url,
    '',
  ];
  const domain = encodeSegment(
    scheme === 'http' ? `${HTTP_PREFIX}${host}` : host,
  );
  const path = rest.replace(/^\//, '');
  if (!path) return domain;
  const segments = path
    .split('/')
    .map((segment) => encodeSegment(segment || EMPTY_SEGMENT));
  return `${domain}/${segments.join('/')}`;
}

/** A typed page address, https by default; undefined if not an address. */
export function parseAnywhereUrl(text: string): string | undefined {
  const typed = text.trim();
  if (!typed || /\s/.test(typed)) return undefined;
  const candidate = /^https?:\/\//i.test(typed) ? typed : `https://${typed}`;
  if (!URL.canParse(candidate)) return undefined;
  const url = new URL(candidate);
  // A bare word is a search, not a site.
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') {
    return undefined;
  }
  // A fragment is a place in the page, not another page.
  url.hash = '';
  return url.href;
}

/** The host of a page's address, if it has one; YouTube without its `www.`. */
export function urlHost(url: string): string | undefined {
  if (!URL.canParse(url)) return undefined;
  const { hostname } = new URL(url);
  return hostname === 'www.youtube.com' ? 'youtube.com' : hostname;
}

/** The address that a decoded `domain` and `path` stand for. */
export function anywhereUrlFromSegments(
  domain: string | undefined,
  path: string | string[] | undefined,
): string | undefined {
  if (!domain) return undefined;
  const origin = domain.startsWith(HTTP_PREFIX)
    ? `http://${domain.slice(HTTP_PREFIX.length)}`
    : `https://${domain}`;
  const segments = typeof path === 'string' ? path.split('/') : (path ?? []);
  const rest = segments.map((segment) =>
    segment === EMPTY_SEGMENT ? '' : segment,
  );
  return `${origin}/${rest.join('/')}`;
}
