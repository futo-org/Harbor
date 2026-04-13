import react from '@vitejs/plugin-react';
import { createRequire } from 'module';
import path from 'path';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'configure-wasm-mime',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
          }
          next();
        });
      },
    },
  ],
  optimizeDeps: {
    exclude: [
      '@sqlite.org/sqlite-wasm',
      '@polycentric/rs-core-wasm-browser',
      '@polycentric/js-browser',
      '@polycentric/js-core',
    ],
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
    fs: {
      allow: [
        path.resolve(__dirname, '../../../'),
        path.resolve(__dirname, '../../../rs-core/pkg'),
        path.dirname(
          require.resolve('@polycentric/rs-core-wasm-browser/package.json'),
        ),
      ],
    },
  },
  assetsInclude: ['**/*.wasm'],
  resolve: {
    alias: {
      '@polycentric/js-browser': path.resolve(__dirname, '../../src/index.ts'),
      '@polycentric/js-core': path.resolve(
        __dirname,
        '../../../js-core/src/index.ts',
      ),
      '@polycentric/rs-core-wasm-browser': path.resolve(
        __dirname,
        '../../../rs-core-wasm-browser',
      ),
    },
  },
});
