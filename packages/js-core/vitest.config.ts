import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@polycentric/rs-core-uniffi-web/generated': path.resolve(
        __dirname,
        'src/__mocks__/rs-core-uniffi-web-generated.ts',
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
});
