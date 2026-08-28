import metascraper from 'metascraper';
import metascraperDescription from 'metascraper-description';
import metascraperImage from 'metascraper-image';
import metascraperTitle from 'metascraper-title';
import metascraperUrl from 'metascraper-url';
import type { HtmlFetcher } from './fetch.js';

export type LinkMetadata = {
  title: string | null;
  description: string | null;
  image: string | null;
  url: string | null;
};

// The target returned a non-2xx status. Carries it so the caller reports the
// real cause (e.g. rate-limited, gone) instead of a blanket bad-gateway.
export class UpstreamStatusError extends Error {
  constructor(readonly status: number) {
    super(`target responded with status ${status}`);
    this.name = 'UpstreamStatusError';
  }
}

// Rate-limit and transient upstream/proxy statuses worth retrying.
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

export type ScrapeOptions = {
  retries?: number;
  backoffMs?: (attempt: number) => number;
};

// Exponential backoff with jitter, capped at 8s.
const defaultBackoff = (attempt: number): number =>
  Math.min(8_000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const extract = metascraper([
  metascraperTitle(),
  metascraperDescription(),
  metascraperImage(),
  metascraperUrl(),
]);

// Fetch a URL (via `fetchHtml`) and extract its link metadata, retrying
// rate-limited/transient statuses. Throws `UpstreamStatusError` if it never 2xxs.
export const scrape = async (
  targetUrl: string,
  fetchHtml: HtmlFetcher,
  { retries = 3, backoffMs = defaultBackoff }: ScrapeOptions = {},
): Promise<LinkMetadata> => {
  for (let attempt = 0; ; attempt++) {
    const { html, url, statusCode } = await fetchHtml(targetUrl);
    if (statusCode >= 200 && statusCode < 300) {
      const meta = await extract({ html, url });
      return {
        title: meta.title ?? null,
        description: meta.description ?? null,
        image: meta.image ?? null,
        url: meta.url ?? null,
      };
    }
    if (RETRYABLE_STATUSES.has(statusCode) && attempt < retries) {
      await sleep(backoffMs(attempt + 1));
      continue;
    }
    throw new UpstreamStatusError(statusCode);
  }
};
