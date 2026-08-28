import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { CRAWLER_USER_AGENT, createHostThrottle, fetchMode } from './fetch.js';

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

describe('CRAWLER_USER_AGENT', () => {
  test('is a known link-preview agent', () => {
    assert.match(CRAWLER_USER_AGENT, /facebookexternalhit/);
  });
});

describe('createHostThrottle', () => {
  test('paces successive requests to the same host', async () => {
    const throttle = createHostThrottle(60);
    const start = Date.now();
    await throttle('a.com');
    await throttle('a.com');
    await throttle('a.com');
    assert.ok(Date.now() - start >= 110, 'three calls span ~2 intervals');
  });

  test('does not pace across different hosts', async () => {
    const throttle = createHostThrottle(60);
    const start = Date.now();
    await throttle('a.com');
    await throttle('b.com');
    await throttle('c.com');
    assert.ok(Date.now() - start < 40);
  });

  test('is disabled at interval 0', async () => {
    const throttle = createHostThrottle(0);
    const start = Date.now();
    for (let i = 0; i < 5; i++) await throttle('a.com');
    assert.ok(Date.now() - start < 20);
  });
});
