import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { fileURLToPath } from 'node:url';
import createBrowserless from 'browserless';
import getHTML from 'html-get';
import metascraper from 'metascraper';
import metascraperDescription from 'metascraper-description';
import metascraperImage from 'metascraper-image';
import metascraperTitle from 'metascraper-title';
import metascraperUrl from 'metascraper-url';
import { Counter, collectDefaultMetrics, register } from 'prom-client';

collectDefaultMetrics();
const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Requests handled, by path and status.',
  labelNames: ['path', 'status'],
});

// A real desktop Chrome UA for the headless-prerender path (JS-heavy SPAs that
// only inject their meta tags client-side). Headless Chromium's default
// `HeadlessChrome` UA trips some sites' "unsupported browser" gate, so we
// present a normal browser identity for the browser process.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Social-crawler UA for the plain-fetch path. Sites like YouTube, Google, X,
// etc. serve their Open Graph / Twitter-card tags directly to link-preview
// crawlers (that's how Facebook/Slack/Discord unfurl them) while showing a
// normal browser a consent / "unsupported browser" interstitial that carries no
// tags. Identifying as a crawler is what makes metascraper actually have
// something to read — no per-site code, no oEmbed, no cookies.
export const CRAWLER_USER_AGENT =
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

// Domains that serve crawler metadata on a plain request and don't need (and
// often reject) a headless browser. For these we fetch directly as the crawler;
// everything else is prerendered to cover client-rendered pages.
const FETCH_DIRECT_DOMAINS = [
  'youtube',
  'youtu',
  'google',
  'vimeo',
  'twitter',
  'x.com',
  'soundcloud',
  'spotify',
  'reddit',
  'tiktok',
  'instagram',
  'facebook',
  'nytimes',
  'bbc',
  'imdb',
  'github',
  'wikipedia',
  'twitch',
  'bitchute',
  'rumble',
  'dailymotion',
  'nebula',
];

/** Route a URL to a plain fetch (crawler-friendly hosts) or headless prerender. */
export const fetchMode = (targetUrl: string): 'fetch' | 'prerender' => {
  try {
    const host = new URL(targetUrl).hostname;
    return FETCH_DIRECT_DOMAINS.some((d) => host.includes(d))
      ? 'fetch'
      : 'prerender';
  } catch {
    return 'prerender';
  }
};

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

/** Fetches a page's (post-redirect URL + possibly-prerendered) HTML. */
export type HtmlFetcher = (
  targetUrl: string,
) => Promise<{ html: string; url: string; statusCode: number }>;

/**
 * Build the production HTML fetcher: a long-lived Chromium process (via
 * browserless) that either plain-fetches as a crawler or prerenders, per
 * [`fetchMode`]. Returns the fetcher plus a `close` to tear Chromium down.
 */
export const createBrowserlessFetcher = async (): Promise<{
  fetchHtml: HtmlFetcher;
  close: () => Promise<void>;
}> => {
  // Passing `args` replaces browserless's defaultArgs entirely, so we must
  // re-add the sandbox flags it would otherwise supply. Without `--no-sandbox` /
  // `--disable-setuid-sandbox`, Chromium can't launch as our non-root user in a
  // container that lacks CAP_SYS_ADMIN or unprivileged user namespaces.
  // `--disable-dev-shm-usage` avoids crashes when `/dev/shm` is small.
  const browserlessFactory = await createBrowserless({
    launchOpts: {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        `--user-agent=${USER_AGENT}`,
      ],
    },
  });

  const fetchHtml: HtmlFetcher = async (targetUrl) => {
    const context = browserlessFactory.createContext();
    try {
      const { html, url, statusCode } = await getHTML(targetUrl, {
        getBrowserless: () => context,
        // Identify as a link-preview crawler so sites serve their OG tags rather
        // than a consent/unsupported-browser page.
        headers: { 'user-agent': CRAWLER_USER_AGENT },
        // Crawler-friendly hosts (e.g. YouTube) are fetched directly; the rest
        // are prerendered to catch client-rendered metadata.
        getMode: () => fetchMode(targetUrl),
      });
      return {
        html: html ?? '',
        url: url ?? targetUrl,
        statusCode: statusCode ?? 0,
      };
    } finally {
      await (await context).destroyContext();
    }
  };

  return { fetchHtml, close: () => browserlessFactory.close() };
};

/**
 * Fetch `targetUrl` (via the injected `fetchHtml`) and extract its Open Graph /
 * HTML metadata. Throws when the target responds with a non-2xx status.
 */
export const scrape = async (
  targetUrl: string,
  fetchHtml: HtmlFetcher,
): Promise<LinkMetadata> => {
  const { html, url, statusCode } = await fetchHtml(targetUrl);
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`target responded with status ${statusCode}`);
  }
  const meta = await scrapeMetadata({ html, url });
  return {
    title: meta.title ?? null,
    description: meta.description ?? null,
    image: meta.image ?? null,
    url: meta.url ?? null,
  };
};

const PORT = Number(process.env.PORT ?? 8855);

/** Largest image we'll proxy. Preview thumbnails are small; this bounds memory. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Abort an image fetch that stalls. This bounds the scraper's hop to the
 *  arbitrary third-party host — the Rust caller's timeout only covers the
 *  server→scraper hop and does not cancel this outbound fetch, so without it a
 *  slow host would pin a socket here indefinitely. */
const IMAGE_FETCH_TIMEOUT_MS = 10_000;

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

export const isValidHttpUrl = (target: string): boolean => {
  try {
    const { protocol } = new URL(target);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

// NOTE: scheme validation only — this service is the one place outbound
// fetching happens, so real SSRF protection is its network egress boundary
// (the browser fetches a page + every subresource, so per-request filtering
// here is impractical). Keep it constrained at the network layer.

const handleScrape = async (
  target: string,
  res: ServerResponse,
  scrapeUrl: (url: string) => Promise<LinkMetadata>,
): Promise<void> => {
  if (!isValidHttpUrl(target)) {
    sendJson(res, 400, { error: 'url must be http or https' });
    return;
  }

  try {
    sendJson(res, 200, await scrapeUrl(target));
  } catch (error) {
    console.error('scrape failed:', error);
    sendJson(res, 502, { error: 'failed to scrape url' });
  }
};

/** Fetch a remote image and stream it back — the image-proxy counterpart to
 *  `/scrape`. No browser needed; a plain fetch suffices. */
const handleImage = async (
  target: string,
  res: ServerResponse,
): Promise<void> => {
  if (!isValidHttpUrl(target)) {
    sendJson(res, 400, { error: 'url must be http or https' });
    return;
  }

  try {
    const upstream = await fetch(target, {
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    });
    if (!upstream.ok) {
      sendJson(res, 502, { error: `upstream returned ${upstream.status}` });
      return;
    }
    const contentType = upstream.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      sendJson(res, 415, { error: 'not an image' });
      return;
    }
    // Reject early on an honest oversized content-length.
    if (Number(upstream.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) {
      sendJson(res, 413, { error: 'image too large' });
      return;
    }
    // A missing/lying content-length (e.g. chunked) can't make us buffer past
    // the cap: read the body with a running total and bail the moment it's
    // exceeded. Bounds peak memory to MAX_IMAGE_BYTES regardless of the upstream.
    const chunks: Buffer[] = [];
    let total = 0;
    const reader = upstream.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) {
          await reader.cancel(); // release the upstream socket promptly
          sendJson(res, 413, { error: 'image too large' });
          return;
        }
        chunks.push(Buffer.from(value));
      }
    }
    res.writeHead(200, {
      'content-type': contentType,
      'cache-control': 'public, max-age=86400',
    });
    res.end(Buffer.concat(chunks));
  } catch (error) {
    console.error('image fetch failed:', error);
    sendJson(res, 502, { error: 'failed to fetch image' });
  }
};

/**
 * Build the internal HTTP API the polycentric server calls. `scrapeUrl` is
 * injected so tests can drive `/scrape` without a real browser. Must not be
 * exposed publicly (it fetches arbitrary URLs).
 */
export const buildServer = (
  scrapeUrl: (url: string) => Promise<LinkMetadata>,
): Server => {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const { pathname, searchParams } = new URL(
      req.url ?? '/',
      'http://localhost',
    );

    // Known paths only, so label cardinality stays bounded.
    const KNOWN_PATHS = ['/health', '/scrape', '/image', '/metrics'];
    res.on('finish', () => {
      httpRequests.inc({
        path: KNOWN_PATHS.includes(pathname) ? pathname : 'other',
        status: res.statusCode,
      });
    });

    if (req.method === 'GET' && pathname === '/health') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (req.method === 'GET' && pathname === '/metrics') {
      void register.metrics().then(
        (body) => {
          res.writeHead(200, { 'content-type': register.contentType });
          res.end(body);
        },
        () => {
          res.writeHead(500);
          res.end();
        },
      );
      return;
    }

    if (req.method === 'GET' && pathname === '/scrape') {
      const target = searchParams.get('url');
      if (!target) {
        sendJson(res, 400, { error: 'missing url parameter' });
        return;
      }
      void handleScrape(target, res, scrapeUrl);
      return;
    }

    if (req.method === 'GET' && pathname === '/image') {
      const target = searchParams.get('url');
      if (!target) {
        sendJson(res, 400, { error: 'missing url parameter' });
        return;
      }
      void handleImage(target, res);
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  });
};

/** Bootstrap: spawn Chromium, wire the server, and listen. */
const main = async (): Promise<void> => {
  const { fetchHtml, close } = await createBrowserlessFetcher();
  const server = buildServer((url) => scrape(url, fetchHtml));

  server.listen(PORT, () => {
    console.log(`scraper listening on :${PORT}`);
  });

  // Graceful shutdown: stop accepting requests, then tear down Chromium.
  const shutdown = (): void => {
    server.close(() => {
      void close().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('exit', () => {
    void close();
  });
};

// Only bootstrap when run directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
