import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Runs the web host against the real rs-core wasm in a real browser:
// OPFS, the storage worker, and Web Locks only exist there.
export default defineConfig({
  assetsInclude: ['**/*.wasm'],
  test: {
    include: ['src/**/*.browser.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
