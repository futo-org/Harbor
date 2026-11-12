import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { useLinkPreviews } from '@/src/common/link-previews';
import { v2 } from '@polycentric/react-native';
import { useEffect, useMemo, useState } from 'react';

/**
 * The page at `url` as a link: what is `known` of it first, the rest from
 * the server's unfurl. `loading` until there is a title or an answer.
 */
export function useAnywhereLink(
  url: string | undefined,
  known?: Partial<v2.Link>,
): { link: v2.Link | undefined; loading: boolean } {
  const client = usePolycentric();
  const { enabled } = useLinkPreviews();
  const [unfurled, setUnfurled] = useState<{ url: string; info?: v2.Link }>();

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

  const { title, description, image } = known ?? {};
  return useMemo(() => {
    if (!url) return { link: undefined, loading: false };
    const answer = enabled && unfurled?.url === url ? unfurled : undefined;
    const link = v2.Link.create({
      title: title || answer?.info?.title,
      description: description || answer?.info?.description,
      image: image || answer?.info?.image,
      url,
    });
    return { link, loading: enabled && !answer && !link.title };
  }, [enabled, unfurled, title, description, image, url]);
}
