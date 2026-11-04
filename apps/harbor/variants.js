// Written by tools/icons/generate-icons.ts from icons.yaml
const accentByVariant = require('./src/common/assets/images/app-icons/variant-accents.json');

// The build variants (APP_VARIANT), shared by app.config.ts and webManifest.js.
// Staging comes from the eas.json profile env; dev from the local scripts.
const VARIANTS = {
  production: { name: 'Harbor', iconSuffix: '' },
  staging: { name: 'Harbor Staging', iconSuffix: '-staging' },
  dev: { name: 'Harbor Dev', iconSuffix: '-dev' },
};

/** Unknown variants fall back to production. */
function variantConfig(variant) {
  const known = variant in VARIANTS ? variant : 'production';
  return { ...VARIANTS[known], accent: accentByVariant[known] };
}

module.exports = { variantConfig };
