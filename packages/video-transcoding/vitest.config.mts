import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      screenshotFailures: false,
      provider: playwright(),
      // The web backend needs WebCodecs H.264 encode/decode and ImageDecoder for GIF.
      instances: [{ browser: 'chromium' }],
    },
  },
});
