import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { useLinkPreviews } from '@/src/common/link-previews';
import { v2 } from '@polycentric/react-native';
import { useEffect, useReducer } from 'react';
import { fallbackImage } from '../lib/fallback-image';

/** What has been learned of a page, kept so it shows at once next time. */
type Known = {
  /** The server's unfurl, once it has answered. */
  unfurl?: { info?: v2.Link };
  /** The fallback image lookup, once it has finished. */
  fallback?: { image?: string };
  /** What a list showed of the page before it was opened. */
  seed?: v2.Link;
  /** The link as first shown; it does not change after that. */
  shown?: v2.Link;
};

const known = new Map<string, Known>();

function knownOf(url: string): Known {
  let entry = known.get(url);
  if (!entry) {
    entry = {};
    known.set(url, entry);
  }
  return entry;
}

/** Notes what a list shows of a page, for the page it opens. */
export function rememberAnywhereLink(link: v2.Link) {
  knownOf(link.url).seed = link;
}

/**
 * The page at `url` as a link: what is `given` of it first, the rest from
 * the server's unfurl. `loading` until there is enough of it to show; what
 * is shown then stays as it is.
 */
export function useAnywhereLink(
  url: string | undefined,
  given?: Partial<v2.Link>,
): { link: v2.Link | undefined; loading: boolean } {
  const client = usePolycentric();
  const { enabled } = useLinkPreviews();
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  const givenImage = given?.image;

  useEffect(() => {
    if (!url || !enabled || knownOf(url).unfurl) return;
    let cancelled = false;
    void client.urlInfo(url).then((info) => {
      knownOf(url).unfurl = { info: info ? v2.Link.create(info) : undefined };
      if (!cancelled) rerender();
    });
    return () => {
      cancelled = true;
    };
  }, [client, enabled, url]);

  useEffect(() => {
    if (!url || !enabled || givenImage || knownOf(url).fallback) return;
    let cancelled = false;
    void fallbackImage(url).then((image) => {
      knownOf(url).fallback = { image };
      if (!cancelled) rerender();
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, url, givenImage]);

  if (!url) return { link: undefined, loading: false };
  if (!enabled) {
    return { link: v2.Link.create({ ...given, url }), loading: false };
  }

  const entry = knownOf(url);
  if (entry.shown) return { link: entry.shown, loading: false };

  const { unfurl, fallback, seed } = entry;
  const link = v2.Link.create({
    title: given?.title || seed?.title || unfurl?.info?.title,
    description:
      given?.description || seed?.description || unfurl?.info?.description,
    image: givenImage || seed?.image || unfurl?.info?.image || fallback?.image,
    url,
  });
  const settled = !!unfurl && (!!link.image || !!fallback);
  if (settled || (link.title && link.image)) {
    entry.shown = link;
    return { link, loading: false };
  }
  return { link, loading: true };
}
