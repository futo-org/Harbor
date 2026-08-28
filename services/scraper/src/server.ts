import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from 'node:http';
import { Counter, collectDefaultMetrics, register } from 'prom-client';
import { type LinkMetadata, UpstreamStatusError } from './scrape.js';

collectDefaultMetrics();
const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Requests handled, by path and status.',
  labelNames: ['path', 'status'],
});

// Bounds the memory a proxied image can use.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
// Caps the scraper's outbound hop to an arbitrary image host; the Rust caller's
// timeout only covers the server->scraper hop.
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
    // Report a target-side failure with the target's own status; reserve 502
    // for the scraper itself failing to fetch.
    if (
      error instanceof UpstreamStatusError &&
      error.status >= 400 &&
      error.status <= 599
    ) {
      sendJson(res, error.status, {
        error: `target responded with status ${error.status}`,
      });
      return;
    }
    console.error('scrape failed:', error);
    sendJson(res, 502, { error: 'failed to scrape url' });
  }
};

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
    if (Number(upstream.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) {
      sendJson(res, 413, { error: 'image too large' });
      return;
    }
    // Read with a running total so a missing/lying content-length can't make us
    // buffer past the cap.
    const chunks: Buffer[] = [];
    let total = 0;
    const reader = upstream.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) {
          await reader.cancel();
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

// Internal-only HTTP API the polycentric server calls. `scrapeUrl` is injected
// so it can be driven without a real browser. Must not be exposed publicly (it
// fetches arbitrary URLs; SSRF is bounded at the network egress layer).
export const buildServer = (
  scrapeUrl: (url: string) => Promise<LinkMetadata>,
): Server =>
  createServer((req: IncomingMessage, res: ServerResponse) => {
    const { pathname, searchParams } = new URL(
      req.url ?? '/',
      'http://localhost',
    );

    const KNOWN_PATHS = ['/health', '/scrape', '/image', '/metrics'];
    res.on('finish', () => {
      httpRequests.inc({
        path: KNOWN_PATHS.includes(pathname) ? pathname : 'other',
        status: res.statusCode,
      });
    });

    if (req.method !== 'GET') {
      sendJson(res, 404, { error: 'not found' });
      return;
    }

    if (pathname === '/health') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (pathname === '/metrics') {
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

    if (pathname === '/scrape' || pathname === '/image') {
      const target = searchParams.get('url');
      if (!target) {
        sendJson(res, 400, { error: 'missing url parameter' });
        return;
      }
      void (pathname === '/scrape'
        ? handleScrape(target, res, scrapeUrl)
        : handleImage(target, res));
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  });
