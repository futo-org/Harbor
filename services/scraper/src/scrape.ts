import metascraper from 'metascraper';
import metascraperDescription from 'metascraper-description';
import metascraperImage from 'metascraper-image';
import metascraperTitle from 'metascraper-title';
import metascraperUrl from 'metascraper-url';
import type { HtmlFetcher } from './fetch.js';
import { hostOf, log } from './log.js';
import {
  fetchAttempts,
  fetchRetries,
  metadataFields,
  scrapeDuration,
  scrapes,
  statusClass,
} from './metrics.js';
import { fetchMode } from './mode.js';

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

type Outcome = 'ok' | 'upstream_status' | 'error';

// Fetch a URL (via `fetchHtml`) and extract its link metadata, retrying
// rate-limited/transient statuses. Throws `UpstreamStatusError` if it never 2xxs.
// One `target:scrape` log line per call carries host, mode, attempts, the last
// upstream status and which metadata fields came back.
export const scrape = async (
  targetUrl: string,
  fetchHtml: HtmlFetcher,
  { retries = 3, backoffMs = defaultBackoff }: ScrapeOptions = {},
): Promise<LinkMetadata> => {
  const started = performance.now();
  const host = hostOf(targetUrl);
  const mode = fetchMode(targetUrl);
  let attempts = 0;
  let lastStatus = 0;

  const finish = (outcome: Outcome, extra: Record<string, unknown> = {}) => {
    const latencyMs = Math.round(performance.now() - started);
    scrapes.inc({ mode, outcome });
    scrapeDuration.observe({ mode, outcome }, latencyMs / 1000);
    const fields = {
      host,
      mode,
      attempts,
      status: lastStatus,
      outcome,
      latency_ms: latencyMs,
      ...extra,
    };
    if (outcome === 'ok') log.info('scrape', 'scraped', fields);
    else if (outcome === 'upstream_status')
      log.warn('scrape', 'target did not return 2xx', fields);
    else log.error('scrape', 'fetch failed', fields);
  };

  try {
    for (let attempt = 0; ; attempt++) {
      attempts++;
      const { html, url, statusCode } = await fetchHtml(targetUrl);
      lastStatus = statusCode;
      fetchAttempts.inc({ mode, status_class: statusClass(statusCode) });
      if (statusCode >= 200 && statusCode < 300) {
        const meta = await extract({ html, url });
        const result: LinkMetadata = {
          title: meta.title ?? null,
          description: meta.description ?? null,
          image: meta.image ?? null,
          url: meta.url ?? null,
        };
        const present = (Object.keys(result) as (keyof LinkMetadata)[]).filter(
          (field) => result[field] !== null,
        );
        for (const field of present) metadataFields.inc({ field });
        finish('ok', { fields: present, html_bytes: html.length });
        return result;
      }
      if (RETRYABLE_STATUSES.has(statusCode) && attempt < retries) {
        fetchRetries.inc({ status: String(statusCode) });
        await sleep(backoffMs(attempt + 1));
        continue;
      }
      finish('upstream_status');
      throw new UpstreamStatusError(statusCode);
    }
  } catch (error) {
    if (!(error instanceof UpstreamStatusError)) finish('error', { error });
    throw error;
  }
};
