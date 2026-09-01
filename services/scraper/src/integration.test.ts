import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { type HtmlFetcher, createBrowserlessFetcher } from './fetch.js';
import { scrape } from './scrape.js';

// Live smoke test for every referenced platform, through a real headless
// Chromium. `LOCAL:`-prefixed, so `pnpm test:ci` skips them; run with
// `pnpm test` (or `pnpm test:integration`). Public content moves; refresh a
// case if it 404s.
type ProviderCase = { name: string; url: string; image?: boolean };

const PROVIDERS: ProviderCase[] = [
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
  { name: 'Generic OG', url: 'https://www.bbc.com/news' },
];

// Gated on an env flag (set by `test:integration`) so the Chromium-spawning
// `before` never runs in the default/CI suites.
describe('LOCAL: provider unfurl smoke', {
  skip: process.env.SCRAPER_INTEGRATION !== '1',
}, () => {
  let fetchHtml: HtmlFetcher;
  let close: () => Promise<void>;

  before(async () => {
    ({ fetchHtml, close } = await createBrowserlessFetcher());
  });
  after(() => close());

  for (const c of PROVIDERS) {
    test(`LOCAL: unfurls ${c.name}`, async () => {
      const meta = await scrape(c.url, fetchHtml);
      assert.ok(meta.title, `${c.name}: expected a title (${c.url})`);
      if (c.image) {
        assert.ok(meta.image, `${c.name}: expected an image (${c.url})`);
      }
    });
  }
});
