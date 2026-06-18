import createBrowserless from 'browserless';
import getHTML from 'html-get';
import metascraper from 'metascraper';
import metascraperDescription from 'metascraper-description';
import metascraperImage from 'metascraper-image';
import metascraperTitle from 'metascraper-title';
import metascraperUrl from 'metascraper-url';

// Spawn the Chromium process once for the lifetime of the service.
const browserlessFactory = await createBrowserless();

// Tear the Chromium process down when Node exits.
process.on('exit', () => {
  console.log('closing resources!');
  browserlessFactory.close();
});

// Extract only the fields that map onto a polycentric `Link`.
const scrapeMetadata = metascraper([
  metascraperTitle(),
  metascraperDescription(),
  metascraperImage(),
  metascraperUrl(),
]);

export type LinkMetadata = {
  title: string | null;
  description: string | null;
  image: string | null;
  url: string | null;
};

/**
 * Fetch `targetUrl` and extract its Open Graph / HTML metadata.
 *
 * `html-get` decides whether a plain fetch suffices or the page needs to be
 * prerendered through headless Chromium (e.g. client-side apps that inject
 * their tags via JS), so callers don't have to. Each call runs in its own
 * browser context, which is always torn down afterwards.
 */
export const scrape = async (targetUrl: string): Promise<LinkMetadata> => {
  const context = browserlessFactory.createContext();
  try {
    // `html-get` returns the post-redirect URL alongside the (possibly
    // prerendered) HTML; metascraper needs both.
    const { html, url } = await getHTML(targetUrl, {
      getBrowserless: () => context,
    });
    const meta = await scrapeMetadata({ html, url });
    return {
      title: meta.title ?? null,
      description: meta.description ?? null,
      image: meta.image ?? null,
      url: meta.url ?? null,
    };
  } finally {
    await (await context).destroyContext();
  }
};
