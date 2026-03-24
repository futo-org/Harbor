import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  server: {
    fs: {
      allow: [
        path.resolve(__dirname, '../../../'),
        path.resolve(__dirname, '../../../rs-core/pkg'),
      ],
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: 'playwright',
      instances: [
        {
          browser: 'chromium',
        },
        {
          browser: 'firefox',
        },
        // Playwrite webkit doesn't support vfs:OPFS.
        // {
        //   browser: "webkit",
        // },
      ],
    },
  },
});
