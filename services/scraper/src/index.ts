import { fileURLToPath } from 'node:url';
import { createBrowserlessFetcher } from './fetch.js';
import { scrape } from './scrape.js';
import { buildServer } from './server.js';

const PORT = Number(process.env.PORT ?? 8855);

const main = async (): Promise<void> => {
  const { fetchHtml, close } = await createBrowserlessFetcher();
  const server = buildServer((url) => scrape(url, fetchHtml));

  server.listen(PORT, () => {
    console.log(`scraper listening on :${PORT}`);
  });

  const shutdown = (): void => {
    server.close(() => {
      void close().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('exit', () => {
    void close();
  });
};

// Bootstrap only when run directly, so tests can import the modules cleanly.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
