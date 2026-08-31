import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { HtmlFetcher } from './fetch.js';
import { UpstreamStatusError, scrape } from './scrape.js';

const OG_HTML = `<!doctype html><html><head>
  <meta property="og:title" content="Never Gonna Give You Up">
  <meta property="og:description" content="The official video">
  <meta property="og:image" content="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg">
  <meta property="og:url" content="https://www.youtube.com/watch?v=dQw4w9WgXcQ">
</head><body></body></html>`;

const respond = (page: { html?: string; statusCode?: number }): HtmlFetcher => {
  return async (url) => ({
    html: page.html ?? '',
    url,
    statusCode: page.statusCode ?? 200,
  });
};

describe('scrape', () => {
  test('extracts Open Graph metadata', async () => {
    const meta = await scrape('https://youtu.be/x', respond({ html: OG_HTML }));
    assert.equal(meta.title, 'Never Gonna Give You Up');
    assert.equal(meta.description, 'The official video');
    assert.equal(
      meta.image,
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    );
    assert.ok(meta.url);
  });

  test('nulls missing fields rather than throwing', async () => {
    const meta = await scrape(
      'https://example.com',
      respond({ html: '<html><head><title>Bare</title></head></html>' }),
    );
    assert.equal(meta.title, 'Bare');
    assert.equal(meta.description, null);
    assert.equal(meta.image, null);
  });

  test('throws UpstreamStatusError on a non-2xx status', async () => {
    await assert.rejects(
      () => scrape('https://example.com/x', respond({ statusCode: 404 })),
      (e: unknown) => e instanceof UpstreamStatusError && e.status === 404,
    );
  });

  test('retries a 429 and succeeds once it clears', async () => {
    let calls = 0;
    const fetchHtml: HtmlFetcher = async (url) => {
      calls += 1;
      return calls < 3
        ? { html: '', url, statusCode: 429 }
        : { html: OG_HTML, url, statusCode: 200 };
    };
    const meta = await scrape('https://youtu.be/x', fetchHtml, {
      backoffMs: () => 0,
    });
    assert.equal(calls, 3);
    assert.equal(meta.title, 'Never Gonna Give You Up');
  });

  test('gives up after exhausting retries on a persistent 429', async () => {
    let calls = 0;
    const fetchHtml: HtmlFetcher = async (url) => {
      calls += 1;
      return { html: '', url, statusCode: 429 };
    };
    await assert.rejects(
      () =>
        scrape('https://youtu.be/x', fetchHtml, {
          retries: 2,
          backoffMs: () => 0,
        }),
      (e: unknown) => e instanceof UpstreamStatusError && e.status === 429,
    );
    assert.equal(calls, 3, 'initial try + 2 retries');
  });

  test('does not retry a non-retryable status', async () => {
    let calls = 0;
    const fetchHtml: HtmlFetcher = async (url) => {
      calls += 1;
      return { html: '', url, statusCode: 404 };
    };
    await assert.rejects(() =>
      scrape('https://example.com/x', fetchHtml, { backoffMs: () => 0 }),
    );
    assert.equal(calls, 1);
  });
});
