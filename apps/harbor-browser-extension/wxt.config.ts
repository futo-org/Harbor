import { defineConfig } from 'wxt';

// 'dev' | 'staging' | 'production', as in apps/harbor/app.config.ts.
const VARIANT = process.env.APP_VARIANT ?? 'production';
const IS_DEV = VARIANT === 'dev';
const IS_STAGING = VARIANT === 'staging';

const NAME = IS_DEV
  ? 'Harbor Anywhere Dev'
  : IS_STAGING
    ? 'Harbor Anywhere Staging'
    : 'Harbor Anywhere';
const GECKO_ID = IS_DEV
  ? 'anywhere-dev@harbor.social'
  : IS_STAGING
    ? 'anywhere-staging@harbor.social'
    : 'anywhere@harbor.social';
// Written by tools/icons/generate-icons.ts from icons.yaml
const ICON_SUFFIX = IS_DEV ? '-dev' : IS_STAGING ? '-staging' : '';

// The Harbor site whose signed-in identity the extension signs in as.
const HARBOR_APP_URL = (
  process.env.EXPO_PUBLIC_HARBOR_APP_URL ??
  (IS_DEV ? 'http://localhost:8081' : 'https://harbor.social')
).replace(/\/+$/, '');

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  vite: () => ({
    define: { __HARBOR_APP_URL__: JSON.stringify(HARBOR_APP_URL) },
  }),
  dev: { server: { port: 3010 } },
  // Named by the manifest's version, not package.json's.
  zip: { artifactTemplate: '{{name}}-{{version}}-{{browser}}.zip' },
  manifest: ({ browser }) => ({
    name: NAME,
    // Stores only take a version above the last; CI sets one for each build.
    ...(process.env.EXTENSION_VERSION && {
      version: process.env.EXTENSION_VERSION,
    }),
    description: 'Harbor on any page on the web.',
    icons: Object.fromEntries(
      [16, 32, 48, 128].map((size) => [size, `icon/${size}${ICON_SUFFIX}.png`]),
    ),
    // Reads each page's canonical address, description and image.
    permissions: ['tabs', 'scripting'],
    host_permissions: ['<all_urls>'],
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    ...(browser !== 'safari' && { action: {} }),
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: GECKO_ID,
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
