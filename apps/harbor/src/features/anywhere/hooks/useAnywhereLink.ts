import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { useLinkPreviews } from '@/src/common/link-previews';
import { v2 } from '@polycentric/react-native';
import { useEffect, useMemo, useState } from 'react';
import { fallbackImage } from '../lib/fallback-image';

/**
 * The page at `url` as a link: what is `known` of it first, the rest from
 * the server's unfurl. `loading` until nothing more of it can arrive.
 */
export function useAnywhereLink(
  url: string | undefined,
  known?: Partial<v2.Link>,
): { link: v2.Link | undefined; loading: boolean } {
  const client = usePolycentric();
  const { enabled } = useLinkPreviews();
  const [unfurled, setUnfurled] = useState<{ url: string; info?: v2.Link }>();
  const [fallback, setFallback] = useState<{ url: string; image?: string }>();

  const { title, description, image } = known ?? {};

  useEffect(() => {
    if (!url || !enabled) return;
    let cancelled = false;
    void client.urlInfo(url).then((info) => {
      if (cancelled) return;
      setUnfurled({ url, info: info ? v2.Link.create(info) : undefined });
    });
    return () => {
      cancelled = true;
    };
  }, [client, enabled, url]);

  useEffect(() => {
    if (!url || !enabled || image) return;
    let cancelled = false;
    void fallbackImage(url).then((found) => {
      if (!cancelled) setFallback({ url, image: found });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, url, image]);

  return useMemo(() => {
    if (!url) return { link: undefined, loading: false };
    const answer = enabled && unfurled?.url === url ? unfurled : undefined;
    const found = enabled && fallback?.url === url ? fallback : undefined;
    const link = v2.Link.create({
      title: title || answer?.info?.title,
      description: description || answer?.info?.description,
      image: image || answer?.info?.image || found?.image,
      url,
    });
    const complete = !!(link.title && link.description && link.image);
    const settled = !!answer && (!!link.image || !!found);
    return { link, loading: enabled && !complete && !settled };
  }, [enabled, unfurled, fallback, title, description, image, url]);
}
