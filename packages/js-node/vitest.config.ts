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
  },
  test: {
    environment: 'node',
  },
});
