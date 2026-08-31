// Prometheus metrics (scraped by VictoriaMetrics via the pod annotations, see
// deploy/charts/harbor-scraper). Everything is `scraper_`-prefixed so the
// dashboard needs no namespace filter. Target hosts are deliberately not a
// label (unbounded); per-host breakdowns come from the logs.
import {
  Counter,
  Gauge,
  Histogram,
  collectDefaultMetrics,
  register,
} from 'prom-client';

// Node's default metrics keep their generic names; the label picks ours out.
register.setDefaultLabels({ service: 'scraper' });
collectDefaultMetrics();

export { register };

export const httpRequests = new Counter({
  name: 'scraper_http_requests_total',
  help: 'Requests handled, by path and status.',
  labelNames: ['path', 'status'],
});

export const httpDuration = new Histogram({
  name: 'scraper_http_request_duration_seconds',
  help: 'Wall time to answer a request, by path.',
  labelNames: ['path'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30, 60],
});

export const httpInFlight = new Gauge({
  name: 'scraper_http_requests_in_flight',
  help: 'Requests currently being handled, by path.',
  labelNames: ['path'],
});

// outcome: ok | upstream_status (target never 2xx'd) | error (fetch threw)
export const scrapes = new Counter({
  name: 'scraper_scrapes_total',
  help: 'Scrapes by fetch mode and outcome.',
  labelNames: ['mode', 'outcome'],
});

export const scrapeDuration = new Histogram({
  name: 'scraper_scrape_duration_seconds',
  help: 'End-to-end scrape time including retries, by mode and outcome.',
  labelNames: ['mode', 'outcome'],
  buckets: [0.25, 0.5, 1, 2, 5, 10, 20, 30, 60],
});

// status_class: 2xx..5xx, or none when the fetch produced no status.
export const fetchAttempts = new Counter({
  name: 'scraper_fetch_attempts_total',
  help: 'Page fetch attempts (retries included), by mode and status class.',
  labelNames: ['mode', 'status_class'],
});

export const fetchRetries = new Counter({
  name: 'scraper_fetch_retries_total',
  help: 'Retries taken after a retryable upstream status.',
  labelNames: ['status'],
});

// Divide by ok scrapes for "share of previews with an image".
export const metadataFields = new Counter({
  name: 'scraper_metadata_fields_total',
  help: 'Successful scrapes that yielded the field.',
  labelNames: ['field'],
});

export const throttleWait = new Histogram({
  name: 'scraper_throttle_wait_seconds',
  help: 'Time spent waiting on the per-host throttle.',
  buckets: [0.01, 0.1, 0.5, 1, 2, 5, 10],
});

export const browserContexts = new Gauge({
  name: 'scraper_browser_contexts_active',
  help: 'Open headless-browser contexts.',
});

// outcome: ok | upstream_status | not_image | too_large | error
export const imageFetches = new Counter({
  name: 'scraper_image_fetches_total',
  help: 'Image proxy fetches by outcome.',
  labelNames: ['outcome'],
});

export const imageDuration = new Histogram({
  name: 'scraper_image_fetch_duration_seconds',
  help: 'Image proxy fetch time, by outcome.',
  labelNames: ['outcome'],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const imageBytes = new Histogram({
  name: 'scraper_image_bytes',
  help: 'Size of proxied images.',
  buckets: [10e3, 50e3, 100e3, 250e3, 500e3, 1e6, 2.5e6, 5e6, 10e6],
});

export const statusClass = (status: number): string =>
  status >= 100 && status <= 599 ? `${Math.floor(status / 100)}xx` : 'none';
