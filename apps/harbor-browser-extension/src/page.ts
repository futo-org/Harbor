import { browser } from 'wxt/browser';

/** What a page says of itself. */
type PageMeta = { canonical?: string; description?: string; image?: string };

/** Runs in the page, so it can use nothing from this file. */
function readPageMeta(): PageMeta {
  const meta = (selector: string) =>
    document.querySelector<HTMLMetaElement>(selector)?.content || undefined;
  const image = meta('meta[property="og:image"]');
  return {
    canonical:
      document.querySelector<HTMLLinkElement>('link[rel~="canonical"]')?.href ||
      undefined,
    description:
      meta('meta[property="og:description"]') ??
      meta('meta[name="description"]'),
    image: image && new URL(image, document.baseURI).href,
  };
}

/** A host with the `www.` that sites add or drop between addresses. */
function bareHost(url: URL): string {
  return url.hostname.replace(/^www\./, '');
}

/** `url` without its fragment, which is a place in the page, not a page. */
function withoutFragment(url: string): string {
  if (!URL.canParse(url)) return url;
  const page = new URL(url);
  page.hash = '';
  return page.href;
}

/**
 * The page's canonical address, so tracking parameters do not split its
 * posts. Ignored when it points at another site, or at the site's front
 * page from any other page, as some sites' do.
 */
export function canonicalUrl(url: string, canonical: string | undefined) {
  if (!canonical || !URL.canParse(canonical) || !URL.canParse(url)) {
    return withoutFragment(url);
  }
  const page = new URL(url);
  const target = new URL(canonical);
  const trusted =
    /^https?:$/.test(target.protocol) &&
    bareHost(target) === bareHost(page) &&
    (target.pathname !== '/' || target.search !== '' || page.pathname === '/');
  return withoutFragment(trusted ? target.href : url);
}

/** The tab's page, as it describes itself. Empty where it cannot be read. */
export async function pageMeta(tabId: number): Promise<PageMeta> {
  try {
    const [frame] = await browser.scripting.executeScript({
      target: { tabId },
      func: readPageMeta,
    });
    return (frame?.result as PageMeta | undefined) ?? {};
  } catch {
    // The browser's own pages, and stores, cannot be scripted.
    return {};
  }
}
