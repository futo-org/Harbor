import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@polycentric/rs-core-wasm/generated': path.resolve(
        __dirname,
        'src/__mocks__/rs-core-wasm-generated.ts',
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
});
