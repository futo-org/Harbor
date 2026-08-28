import { fileURLToPath } from 'node:url';
import { createBrowserlessFetcher } from './fetch.js';
import { log } from './log.js';
import { scrape } from './scrape.js';
import { buildServer } from './server.js';

const PORT = Number(process.env.PORT ?? 8855);

const main = async (): Promise<void> => {
  const { fetchHtml, close } = await createBrowserlessFetcher();
  const server = buildServer((url) => scrape(url, fetchHtml));

  server.listen(PORT, () => {
    log.info('server', 'listening', { port: PORT, node: process.version });
  });

  const shutdown = (signal: string): void => {
    log.info('server', 'shutting down', { signal });
    server.close(() => {
      void close().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('exit', () => {
    void close();
  });
  process.on('unhandledRejection', (reason) => {
    log.error('server', 'unhandled rejection', { error: reason });
  });
};

// Bootstrap only when run directly, so tests can import the modules cleanly.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
