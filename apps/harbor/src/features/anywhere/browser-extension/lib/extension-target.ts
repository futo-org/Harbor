import {
  anywhereUrlFromSegments,
  decodeAnywhereSegment,
} from '@/src/common/util/anywhere-url';

/** What the extension shows beside a tab. */
export type ExtensionTarget =
  /** The posts about a web page. */
  | { kind: 'page'; url: string; title?: string }
  /** A Harbor post, to read and reply to. */
  | {
      kind: 'post';
      identityId: string;
      keyFingerprint: string;
      sequence: string;
    };

const ANYWHERE_ROUTE = /^\/anywhere\/u\/([^/]+)(?:\/(.*))?$/;
const POST_ROUTE = /^\/([^/]+)\/post\/([^/]+)\/(\d+)(\/image\/\d+)?$/;

/** The target for a tab on `url`; `sitePath` is its path on the Harbor site. */
export function extensionTarget(
  url: string | undefined,
  title: string | undefined,
  sitePath: string | undefined,
): ExtensionTarget | undefined {
  const about = sitePath?.match(ANYWHERE_ROUTE);
  if (about) {
    const page = anywhereUrlFromSegments(
      decodeAnywhereSegment(about[1]),
      about[2] === undefined ? undefined : decodeAnywhereSegment(about[2]),
    );
    if (page) return { kind: 'page', url: page };
  }

  const post = sitePath?.match(POST_ROUTE);
  if (post) {
    const [, identityId, keyFingerprint, sequence] = post;
    return { kind: 'post', identityId, keyFingerprint, sequence };
  }

  // Only web pages can be posted about, not the browser's own.
  if (url && /^https?:\/\//.test(url)) return { kind: 'page', url, title };
  return undefined;
}
