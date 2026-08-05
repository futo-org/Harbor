import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
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

// A real desktop Chrome UA. Headless Chromium's default `HeadlessChrome` UA
// gets some sites (e.g. YouTube) to redirect to an "unsupported browser" gate
// instead of serving the page, so we present a normal browser identity.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Spawn the Chromium process once for the lifetime of the service. The
// `--user-agent` flag sets the UA browser-wide for the prerender path.
//
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
 *
 * Throws when the target responds with a non-2xx status.
 */
export const scrape = async (targetUrl: string): Promise<LinkMetadata> => {
  const context = browserlessFactory.createContext();
  try {
    // `html-get` returns the post-redirect URL alongside the (possibly
    // prerendered) HTML; metascraper needs both.
    const { html, url, statusCode } = await getHTML(targetUrl, {
      getBrowserless: () => context,
      // Same UA on the plain-fetch path (html-get may skip the browser).
      headers: { 'user-agent': USER_AGENT },
    });
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
  } finally {
    await (await context).destroyContext();
  }
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

const isValidHttpUrl = (target: string): boolean => {
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
): Promise<void> => {
  if (!isValidHttpUrl(target)) {
    sendJson(res, 400, { error: 'url must be http or https' });
    return;
  }

  try {
    sendJson(res, 200, await scrape(target));
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

// Internal-only HTTP API the polycentric server calls. Must not be exposed
// publicly (it fetches arbitrary URLs).
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
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
    void handleScrape(target, res);
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

server.listen(PORT, () => {
  console.log(`scraper listening on :${PORT}`);
});

// Graceful shutdown: stop accepting requests, then tear down Chromium.
const shutdown = (): void => {
  server.close(() => {
    void browserlessFactory.close().finally(() => process.exit(0));
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
