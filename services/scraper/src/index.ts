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

const PORT = Number(process.env.PORT ?? 3002);

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const handleScrape = async (
  target: string,
  res: ServerResponse,
): Promise<void> => {
  // Basic input validation only. NOTE: this is *not* SSRF protection — the
  // headless browser fetches `target` and every subresource it references, so
  // per-request filtering here is impractical. A deployment must constrain
  // egress at the network layer (allowlist / firewall).
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    sendJson(res, 400, { error: 'invalid url' });
    return;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
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

// Internal-only HTTP API the polycentric server calls. Must not be exposed
// publicly (it fetches arbitrary URLs).
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const { pathname, searchParams } = new URL(
    req.url ?? '/',
    'http://localhost',
  );

  if (req.method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { status: 'ok' });
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
