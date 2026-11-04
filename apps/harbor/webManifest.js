const { appLinks } = require('./appLinks');
const { variantConfig } = require('./variants');

/** The build variant whose name and icons a request host gets. */
function variantForHost(host) {
  return Object.keys(appLinks).find(
    (variant) => appLinks[variant].host === host,
  );
}

/** The web app manifest of a build variant (APP_VARIANT). */
function buildWebManifest(variant) {
  const { name, iconSuffix, accent } = variantConfig(variant);

  return {
    name,
    short_name: name,
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: accent,
    icons: [192, 512].map((size) => ({
      src: `/pwa-icon-${size}${iconSuffix}.png`,
      sizes: `${size}x${size}`,
      type: 'image/png',
    })),
  };
}

module.exports = { buildWebManifest, variantForHost };

// Run by the dev scripts: the dev server only serves files, so the manifest
// is written to public/ (gitignored) first. Deployed hosts get it from server.js.
if (require.main === module) {
  require('node:fs').writeFileSync(
    require('node:path').join(__dirname, 'public/manifest.webmanifest'),
    `${JSON.stringify(buildWebManifest('dev'), null, 2)}\n`,
  );
}
