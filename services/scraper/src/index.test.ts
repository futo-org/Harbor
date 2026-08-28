import assert from 'node:assert/strict';
import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import {
  CRAWLER_USER_AGENT,
  type HtmlFetcher,
  type LinkMetadata,
  buildServer,
  createBrowserlessFetcher,
  fetchMode,
  isValidHttpUrl,
  scrape,
} from './index.js';

/** Start an http.Server on an ephemeral port and return its base URL + closer. */
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

// ── Pure routing / validation ──────────────────────────────────────────────

describe('fetchMode', () => {
  test('routes crawler-friendly hosts to a plain fetch', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://vimeo.com/12345',
      'https://twitter.com/x/status/1',
      'https://old.reddit.com/r/x',
    ]) {
      assert.equal(fetchMode(url), 'fetch', url);
    }
  });

  test('prerenders everything else, and malformed URLs', () => {
    assert.equal(fetchMode('https://example.com/article'), 'prerender');
    assert.equal(fetchMode('https://some-spa.app/p/1'), 'prerender');
    assert.equal(fetchMode('not a url'), 'prerender');
  });
});

describe('constants', () => {
  test('crawler UA is a known link-preview agent', () => {
    assert.match(CRAWLER_USER_AGENT, /facebookexternalhit/);
  });
});

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

// ── scrape(): fetch (injected) -> metascraper extraction ────────────────────

describe('scrape', () => {
  const ogHtml = `<!doctype html><html><head>
    <meta property="og:title" content="Never Gonna Give You Up">
    <meta property="og:description" content="The official video">
    <meta property="og:image" content="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg">
    <meta property="og:url" content="https://www.youtube.com/watch?v=dQw4w9WgXcQ">
  </head><body></body></html>`;

  test('extracts Open Graph metadata from the fetched HTML', async () => {
    const fetchHtml: HtmlFetcher = async (url) => ({
      html: ogHtml,
      url,
      statusCode: 200,
    });
    const meta = await scrape(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      fetchHtml,
    );
    assert.equal(meta.title, 'Never Gonna Give You Up');
    assert.equal(meta.description, 'The official video');
    assert.equal(
      meta.image,
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    );
    assert.ok(meta.url);
  });

  test('nulls missing fields rather than throwing', async () => {
    const fetchHtml: HtmlFetcher = async (url) => ({
      html: '<html><head><title>Bare</title></head></html>',
      url,
      statusCode: 200,
    });
    const meta = await scrape('https://example.com', fetchHtml);
    assert.equal(meta.title, 'Bare');
    assert.equal(meta.description, null);
    assert.equal(meta.image, null);
  });

  test('throws on a non-2xx upstream status', async () => {
    const fetchHtml: HtmlFetcher = async (url) => ({
      html: '',
      url,
      statusCode: 404,
    });
    await assert.rejects(() =>
      scrape('https://example.com/missing', fetchHtml),
    );
  });
});

// ── HTTP server: /health, /scrape, 404 ──────────────────────────────────────

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
    // Inject a fake scrapeUrl so no browser/network is needed; a URL containing
    // "boom" simulates a scrape failure.
    const server = buildServer(async (url) => {
      if (url.includes('boom')) {
        throw new Error('scrape blew up');
      }
      return scraped;
    });
    ({ base, close } = await listen(server));
  });
  after(() => close());

  test('GET /health -> 200 ok', async () => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  });

  test('GET /scrape returns the extracted metadata', async () => {
    const res = await fetch(
      `${base}/scrape?url=${encodeURIComponent('https://good.example/p')}`,
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), scraped);
  });

  test('GET /scrape without url -> 400', async () => {
    const res = await fetch(`${base}/scrape`);
    assert.equal(res.status, 400);
  });

  test('GET /scrape with a non-http url -> 400', async () => {
    const res = await fetch(
      `${base}/scrape?url=${encodeURIComponent('ftp://nope')}`,
    );
    assert.equal(res.status, 400);
  });

  test('GET /scrape when scraping fails -> 502', async () => {
    const res = await fetch(
      `${base}/scrape?url=${encodeURIComponent('https://boom.example')}`,
    );
    assert.equal(res.status, 502);
  });

  test('unknown path -> 404', async () => {
    const res = await fetch(`${base}/nope`);
    assert.equal(res.status, 404);
  });
});

// ── HTTP server: /image proxy against a real mock upstream ──────────────────

describe('server /image proxy', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const OVERSIZE = 10 * 1024 * 1024 + 1; // MAX_IMAGE_BYTES + 1

  let base: string;
  let closeScraper: () => Promise<void>;
  let upstream: string;
  let closeUpstream: () => Promise<void>;

  before(async () => {
    // Mock third-party image host.
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
        // Declared oversize: the handler rejects on content-length before reading.
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

  test('rejects an oversized image (content-length) -> 413', async () => {
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

// ── Real end-to-end per provider (needs Chromium + network); skipped in CI ──
//
// A live smoke test for every provider the router special-cases (plus the other
// platforms Grayjay links to), so we can confirm the crawler-UA / fetch-mode
// approach actually returns metadata for each — and notice when one changes its
// bot handling. Run locally with `pnpm test`; `pnpm test:ci` skips these (the
// `LOCAL:` prefix). URLs are long-lived but public content can move; refresh a
// case if it 404s. One Chromium process is shared across all cases.
type ProviderCase = {
  name: string;
  url: string;
  /** Providers that reliably expose an image; asserted when true. */
  image?: boolean;
};

const PROVIDER_CASES: ProviderCase[] = [
  {
    name: 'YouTube (watch)',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    image: true,
  },
  {
    name: 'YouTube (youtu.be)',
    url: 'https://youtu.be/dQw4w9WgXcQ',
    image: true,
  },
  { name: 'X', url: 'https://x.com/jack/status/20' },
  { name: 'Vimeo', url: 'https://vimeo.com/76979871', image: true },
  { name: 'Rumble', url: 'https://rumble.com/c/Rumble' },
  { name: 'BitChute', url: 'https://www.bitchute.com/channel/bitchute/' },
  { name: 'Twitch', url: 'https://www.twitch.tv/twitch', image: true },
  {
    name: 'SoundCloud',
    url: 'https://soundcloud.com/forss/flickermood',
    image: true,
  },
  {
    name: 'Spotify',
    url: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
    image: true,
  },
  { name: 'Dailymotion', url: 'https://www.dailymotion.com/dailymotion' },
  { name: 'Nebula', url: 'https://nebula.tv' },
  { name: 'Kick', url: 'https://kick.com/xqc' },
  { name: 'Odysee', url: 'https://odysee.com/@Odysee:8' },
  { name: 'PeerTube (FUTO)', url: 'https://peertube.futo.org' },
  { name: 'Generic OG (example)', url: 'https://www.bbc.com/news' },
];

describe('LOCAL: provider unfurl smoke (needs Chromium + network)', () => {
  let fetchHtml: HtmlFetcher;
  let close: () => Promise<void>;

  before(async () => {
    ({ fetchHtml, close } = await createBrowserlessFetcher());
  });
  after(() => close());

  for (const c of PROVIDER_CASES) {
    test(`LOCAL: unfurls ${c.name}`, async () => {
      const meta = await scrape(c.url, fetchHtml);
      assert.ok(meta.title, `${c.name}: expected a title, got none (${c.url})`);
      if (c.image) {
        assert.ok(meta.image, `${c.name}: expected an image (${c.url})`);
      }
    });
  }
});
