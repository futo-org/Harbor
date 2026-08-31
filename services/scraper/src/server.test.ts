import assert from 'node:assert/strict';
import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { type LinkMetadata, UpstreamStatusError } from './scrape.js';
import { buildServer, isValidHttpUrl } from './server.js';

const listen = async (
  server: Server,
): Promise<{ base: string; close: () => Promise<void> }> => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};

describe('isValidHttpUrl', () => {
  test('accepts http(s) only', () => {
    assert.ok(isValidHttpUrl('http://a.com'));
    assert.ok(isValidHttpUrl('https://a.com/x?y=1'));
    assert.equal(isValidHttpUrl('ftp://a.com'), false);
    assert.equal(isValidHttpUrl('file:///etc/passwd'), false);
    assert.equal(isValidHttpUrl('javascript:alert(1)'), false);
    assert.equal(isValidHttpUrl('not a url'), false);
  });
});

describe('server /scrape + /health', () => {
  let base: string;
  let close: () => Promise<void>;
  const scraped: LinkMetadata = {
    title: 'T',
    description: 'D',
    image: 'https://img/x.jpg',
    url: 'https://x',
  };

  before(async () => {
    const server = buildServer(async (url) => {
      if (url.includes('boom')) throw new Error('scrape blew up');
      if (url.includes('ratelimited')) throw new UpstreamStatusError(429);
      return scraped;
    });
    ({ base, close } = await listen(server));
  });
  after(() => close());

  const scrape = (url: string) =>
    fetch(`${base}/scrape?url=${encodeURIComponent(url)}`);

  test('GET /health -> 200 ok', async () => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  });

  test('returns the extracted metadata', async () => {
    const res = await scrape('https://good.example/p');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), scraped);
  });

  test('missing url -> 400', async () => {
    assert.equal((await fetch(`${base}/scrape`)).status, 400);
  });

  test('non-http url -> 400', async () => {
    assert.equal((await scrape('ftp://nope')).status, 400);
  });

  test('a genuine scraper failure -> 502', async () => {
    assert.equal((await scrape('https://boom.example')).status, 502);
  });

  test('propagates the target status (429), not 502', async () => {
    assert.equal((await scrape('https://ratelimited.example')).status, 429);
  });

  test('unknown path -> 404', async () => {
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  });

  test('GET /metrics exposes the scraper series', async () => {
    const res = await fetch(`${base}/metrics`);
    assert.equal(res.status, 200);
    const body = await res.text();
    for (const name of [
      'scraper_http_requests_total{',
      'scraper_http_request_duration_seconds_bucket{',
      'scraper_http_requests_in_flight{',
      'process_resident_memory_bytes{service="scraper"}',
    ]) {
      assert.ok(body.includes(name), `missing ${name}`);
    }
    assert.match(body, /scraper_http_requests_total\{[^}]*status="502"/);
  });
});

describe('server /image proxy', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const OVERSIZE = 10 * 1024 * 1024 + 1;

  let base: string;
  let closeScraper: () => Promise<void>;
  let upstream: string;
  let closeUpstream: () => Promise<void>;

  before(async () => {
    const up = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.url === '/img.png') {
        res.writeHead(200, {
          'content-type': 'image/png',
          'content-length': String(PNG.length),
        });
        res.end(PNG);
      } else if (req.url === '/page.html') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html></html>');
      } else if (req.url === '/huge.png') {
        res.writeHead(200, {
          'content-type': 'image/png',
          'content-length': String(OVERSIZE),
        });
        res.end(PNG);
      } else {
        res.writeHead(500);
        res.end();
      }
    });
    ({ base: upstream, close: closeUpstream } = await listen(up));

    const scraper = buildServer(async () => ({
      title: null,
      description: null,
      image: null,
      url: null,
    }));
    ({ base, close: closeScraper } = await listen(scraper));
  });
  after(async () => {
    await closeScraper();
    await closeUpstream();
  });

  const image = (path: string) =>
    fetch(`${base}/image?url=${encodeURIComponent(`${upstream}${path}`)}`);

  test('proxies an image with its content-type', async () => {
    const res = await image('/img.png');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), PNG);
  });

  test('rejects a non-image content-type -> 415', async () => {
    assert.equal((await image('/page.html')).status, 415);
  });

  test('rejects an oversized image -> 413', async () => {
    assert.equal((await image('/huge.png')).status, 413);
  });

  test('maps an upstream error -> 502', async () => {
    assert.equal((await image('/boom')).status, 502);
  });

  test('rejects a non-http image url -> 400', async () => {
    const res = await fetch(
      `${base}/image?url=${encodeURIComponent('ftp://nope/x.png')}`,
    );
    assert.equal(res.status, 400);
  });
});
