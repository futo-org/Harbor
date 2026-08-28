import createBrowserless from 'browserless';
import getHTML from 'html-get';
import { hostOf, log } from './log.js';
import { browserContexts, throttleWait } from './metrics.js';
import { fetchMode } from './mode.js';

export { fetchMode, type FetchMode } from './mode.js';

// Browser identity for the prerender path (JS-rendered pages). Chromium's
// default HeadlessChrome UA trips some "unsupported browser" gates.
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Many sites serve Open Graph tags to link-preview crawlers but gate normal
// browsers behind a consent / unsupported-browser page. We fetch as a crawler.
export const CRAWLER_USER_AGENT =
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

// Minimum spacing between requests to the same host; 0 disables it. Set it for
// bulk runs so a single platform is not burst into rate-limiting us.
const HOST_MIN_INTERVAL_MS = Number(
  process.env.SCRAPER_HOST_MIN_INTERVAL_MS ?? 0,
);

export type FetchedPage = { html: string; url: string; statusCode: number };
export type HtmlFetcher = (targetUrl: string) => Promise<FetchedPage>;

// Guarantees at least `intervalMs` between requests to the same host while
// letting different hosts run concurrently. Slots are reserved synchronously,
// so it paces correctly under many concurrent callers.
export const createHostThrottle = (intervalMs: number) => {
  const nextFreeAt = new Map<string, number>();
  return async (host: string): Promise<void> => {
    if (intervalMs <= 0) {
      return;
    }
    const now = Date.now();
    const start = Math.max(now, nextFreeAt.get(host) ?? 0);
    nextFreeAt.set(host, start + intervalMs);
    throttleWait.observe((start - now) / 1000);
    if (start > now) {
      await new Promise((resolve) => setTimeout(resolve, start - now));
    }
  };
};

// The production fetcher: a long-lived Chromium process that plain-fetches as a
// crawler or prerenders per `fetchMode`. Returns the fetcher and a `close`.
export const createBrowserlessFetcher = async (): Promise<{
  fetchHtml: HtmlFetcher;
  close: () => Promise<void>;
}> => {
  // Passing `args` replaces browserless's defaults, so re-add the sandbox flags
  // it would otherwise supply (needed to launch as non-root in a container).
  const factory = await createBrowserless({
    launchOpts: {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        `--user-agent=${BROWSER_USER_AGENT}`,
      ],
    },
  });
  log.info('browser', 'chromium launched', {
    executable: process.env.PUPPETEER_EXECUTABLE_PATH ?? 'bundled',
    host_min_interval_ms: HOST_MIN_INTERVAL_MS,
  });
  const throttle = createHostThrottle(HOST_MIN_INTERVAL_MS);

  const fetchHtml: HtmlFetcher = async (targetUrl) => {
    await throttle(hostOf(targetUrl));
    const context = factory.createContext();
    browserContexts.inc();
    try {
      const { html, url, statusCode } = await getHTML(targetUrl, {
        getBrowserless: () => context,
        headers: { 'user-agent': CRAWLER_USER_AGENT },
        getMode: () => fetchMode(targetUrl),
      });
      return {
        html: html ?? '',
        url: url ?? targetUrl,
        statusCode: statusCode ?? 0,
      };
    } finally {
      browserContexts.dec();
      await (await context).destroyContext();
    }
  };

  const close = async (): Promise<void> => {
    log.info('browser', 'closing chromium');
    await factory.close();
  };

  return { fetchHtml, close };
};
