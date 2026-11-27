import { type Head, toMetadata } from './index';

function setTag(selector: string, create: () => HTMLElement, value?: string) {
  const existing = document.head.querySelector<HTMLElement>(selector);

  if (!value) {
    existing?.remove();
    return;
  }

  const tag = existing ?? document.head.appendChild(create());
  tag.setAttribute(tag.tagName === 'LINK' ? 'href' : 'content', value);
}

function setMeta(attribute: 'name' | 'property', key: string, value?: string) {
  setTag(
    `meta[${attribute}="${key}"]`,
    () => {
      const meta = document.createElement('meta');
      meta.setAttribute(attribute, key);
      return meta;
    },
    value,
  );
}

/**
 * Rewrites the document's title and tags for `head`, the way the server
 * rendered them for the first page: both come from `toMetadata`.
 */
export function applyHead(head: Head) {
  const { title, description, alternates, robots, openGraph, twitter } =
    toMetadata(head);
  const image = openGraph?.images;
  const twitterImage = twitter?.images;

  document.title = title ?? '';
  setMeta('name', 'description', description);
  setMeta('name', 'robots', robots ? 'noindex, follow' : undefined);
  setTag(
    'link[rel="canonical"]',
    () => {
      const link = document.createElement('link');
      link.rel = 'canonical';
      return link;
    },
    alternates?.canonical,
  );

  setMeta('property', 'og:title', openGraph?.title);
  setMeta('property', 'og:description', openGraph?.description);
  setMeta('property', 'og:url', openGraph?.url);
  setMeta('property', 'og:type', openGraph?.type);
  setMeta('property', 'article:published_time', openGraph?.publishedTime);
  setMeta('property', 'article:author', openGraph?.authors?.at(0));

  if (image && typeof image === 'object' && 'url' in image) {
    setMeta('property', 'og:image', image.url);
    setMeta('property', 'og:image:alt', image.alt);
    setMeta('property', 'og:image:width', image.width?.toString());
    setMeta('property', 'og:image:height', image.height?.toString());
    setMeta('property', 'og:image:type', image.type);
  }

  setMeta('name', 'twitter:card', twitter?.card);
  setMeta('name', 'twitter:title', twitter?.title);
  setMeta('name', 'twitter:description', twitter?.description);

  if (
    twitterImage &&
    typeof twitterImage === 'object' &&
    'url' in twitterImage
  ) {
    setMeta('name', 'twitter:image', twitterImage.url);
    setMeta('name', 'twitter:image:alt', twitterImage.alt);
  }
}
