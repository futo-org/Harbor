import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from 'node:http';
import { type Fields, hostOf, log } from './log.js';
import {
  httpDuration,
  httpInFlight,
  httpRequests,
  imageBytes,
  imageDuration,
  imageFetches,
  register,
} from './metrics.js';
import { type LinkMetadata, UpstreamStatusError } from './scrape.js';

// Bounds the memory a proxied image can use.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
// Caps the scraper's outbound hop to an arbitrary image host; the Rust caller's
// timeout only covers the server->scraper hop.
const IMAGE_FETCH_TIMEOUT_MS = 10_000;

const KNOWN_PATHS = ['/health', '/scrape', '/image', '/metrics'];

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

// Per-request fields the handlers add to; emitted as the `target:access` line.
type RequestContext = Fields;

const handleScrape = async (
  target: string,
  res: ServerResponse,
  ctx: RequestContext,
  scrapeUrl: (url: string) => Promise<LinkMetadata>,
): Promise<void> => {
  if (!isValidHttpUrl(target)) {
    ctx.outcome = 'invalid_url';
    sendJson(res, 400, { error: 'url must be http or https' });
    return;
  }
  try {
    const meta = await scrapeUrl(target);
    ctx.outcome = 'ok';
    sendJson(res, 200, meta);
  } catch (error) {
    // Report a target-side failure with the target's own status; reserve 502
    // for the scraper itself failing to fetch.
    if (
      error instanceof UpstreamStatusError &&
      error.status >= 400 &&
      error.status <= 599
    ) {
      ctx.outcome = 'upstream_status';
      ctx.upstream_status = error.status;
      sendJson(res, error.status, {
        error: `target responded with status ${error.status}`,
      });
      return;
    }
    ctx.outcome = 'error';
    ctx.error = error;
    sendJson(res, 502, { error: 'failed to scrape url' });
  }
};

const handleImage = async (
  target: string,
  res: ServerResponse,
  ctx: RequestContext,
): Promise<void> => {
  if (!isValidHttpUrl(target)) {
    ctx.outcome = 'invalid_url';
    sendJson(res, 400, { error: 'url must be http or https' });
    return;
  }
  const started = performance.now();
  const finish = (outcome: string): void => {
    ctx.outcome = outcome;
    imageFetches.inc({ outcome });
    imageDuration.observe({ outcome }, (performance.now() - started) / 1000);
  };
  try {
    const upstream = await fetch(target, {
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    });
    ctx.upstream_status = upstream.status;
    if (!upstream.ok) {
      finish('upstream_status');
      sendJson(res, 502, { error: `upstream returned ${upstream.status}` });
      return;
    }
    const contentType = upstream.headers.get('content-type') ?? '';
    ctx.content_type = contentType;
    if (!contentType.startsWith('image/')) {
      finish('not_image');
      sendJson(res, 415, { error: 'not an image' });
      return;
    }
    if (Number(upstream.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) {
      finish('too_large');
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
          finish('too_large');
          sendJson(res, 413, { error: 'image too large' });
          return;
        }
        chunks.push(Buffer.from(value));
      }
    }
    ctx.bytes = total;
    imageBytes.observe(total);
    finish('ok');
    res.writeHead(200, {
      'content-type': contentType,
      'cache-control': 'public, max-age=86400',
    });
    res.end(Buffer.concat(chunks));
  } catch (error) {
    ctx.error = error;
    finish('error');
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
    const started = performance.now();
    const { pathname, searchParams } = new URL(
      req.url ?? '/',
      'http://localhost',
    );
    const path = KNOWN_PATHS.includes(pathname) ? pathname : 'other';
    const target = searchParams.get('url');
    const ctx: RequestContext = { method: req.method, path: pathname };
    if (target) ctx.host = hostOf(target);

    httpInFlight.inc({ path });
    res.on('finish', () => {
      const latencyMs = Math.round(performance.now() - started);
      httpInFlight.dec({ path });
      httpRequests.inc({ path, status: res.statusCode });
      httpDuration.observe({ path }, latencyMs / 1000);
      // Probes and scrapes are noisy at INFO; failures always surface.
      const quiet = pathname === '/health' || pathname === '/metrics';
      const fields = { ...ctx, status: res.statusCode, latency_ms: latencyMs };
      if (res.statusCode >= 500) log.error('access', 'request failed', fields);
      else if (res.statusCode >= 400)
        log.warn('access', 'request rejected', fields);
      else if (!quiet) log.info('access', 'request', fields);
      else log.debug('access', 'request', fields);
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
      if (!target) {
        ctx.outcome = 'missing_url';
        sendJson(res, 400, { error: 'missing url parameter' });
        return;
      }
      void (pathname === '/scrape'
        ? handleScrape(target, res, ctx, scrapeUrl)
        : handleImage(target, res, ctx));
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  });
