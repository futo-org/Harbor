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

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  dev: { server: { port: 3010 } },
  manifest: ({ browser }) => ({
    name: NAME,
    description: 'Harbor on any page on the web.',
    icons: Object.fromEntries(
      [16, 32, 48, 128].map((size) => [size, `icon/${size}${ICON_SUFFIX}.png`]),
    ),
    permissions: ['tabs'],
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
