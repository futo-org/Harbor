const path = require('node:path');
const fs = require('node:fs');
const { createServer } = require('node:http');
const { createRequestHandler } = require('expo-server/adapter/http');
const {
  appLinks,
  buildAppleAppSiteAssociation,
  buildAssetLinks,
  buildPolycentricAliases,
} = require('./appLinks');

const CLIENT_DIR = path.join(__dirname, 'dist', 'client');
const SERVER_DIR = path.join(__dirname, 'dist', 'server');
// Renders each page on request (`web.output: 'server'`)
const handler = createRequestHandler({
  build: SERVER_DIR,
  environment: process.env.NODE_ENV,
});
const port = process.env.PORT || 8080;

// Any EXPO_PUBLIC_* set on the container overrides the baked-in value.
const runtimeEnv = {};
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith('EXPO_PUBLIC_') && value) runtimeEnv[key] = value;
}
// SSR reads the same global, and +html.tsx hands it to the client.
globalThis.__HARBOR_ENV__ = runtimeEnv;

// One web image serves every environment, so staging icons are served on its
// host, under the usual URLs
const STAGING_ICON_FILE_BY_URL_PATH = {
  '/favicon.ico': '/favicon-staging.ico',
  '/apple-touch-icon.png': '/apple-touch-icon-staging.png',
};

// Base URL for the exported bundle (e.g. the static CDN). CI uploads the
// same /_expo and /assets tree under it and rewrites the js/css to match.
const assetsBaseUrl = (process.env.HARBOR_STATIC_ASSETS_URL ?? '').replace(
  /\/$/,
  '',
);

// Point the pages' js and css at the assets base URL. Matches root-relative
// paths only, so restarts don't re-patch.
if (assetsBaseUrl) {
  const manifestFile = path.join(SERVER_DIR, '_expo', 'routes.json');
  const manifest = fs.readFileSync(manifestFile, 'utf8');
  fs.writeFileSync(
    manifestFile,
    manifest.replace(/"\/(_expo|assets)\//g, `"${assetsBaseUrl}/$1/`),
  );
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
};

// Well-known files built for the requested host: verification files for iOS
// Universal Links and Android App Links, and the polycentric alias document.
// Other hosts (alt domains, self-hosters) get a 404.
const APP_LINK_FILE_BUILDERS = {
  '/.well-known/apple-app-site-association': buildAppleAppSiteAssociation,
  '/.well-known/assetlinks.json': buildAssetLinks,
  '/.well-known/polycentric.json': buildPolycentricAliases,
};

function serveAppLinkFile(req, res, next) {
  const buildAppLinkFile = APP_LINK_FILE_BUILDERS[req.url.split('?')[0]];
  if (!buildAppLinkFile) return next();

  const appLinkFile = buildAppLinkFile(req.headers.host);
  if (!appLinkFile) {
    res.statusCode = 404;
    res.end('Not Found');
    return;
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  // Public documents; alias resolution happens via cross-origin browser fetch.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(appLinkFile));
}

function serveVersion(req, res, next) {
  if (req.url.split('?')[0] !== '/version') return next();

  if (!process.env.HARBOR_COMMIT) {
    res.statusCode = 404;
    res.end('Not Found');
    return;
  }

  res.setHeader('Content-Type', 'text/plain');
  res.end(process.env.HARBOR_COMMIT);
}

function serveStatic(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const staticFilePath =
    (req.headers.host === 'staging.harbor.social' &&
      STAGING_ICON_FILE_BY_URL_PATH[urlPath]) ||
    urlPath;
  const filePath = path.join(CLIENT_DIR, staticFilePath);

  if (!filePath.startsWith(CLIENT_DIR)) return next();

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) return next();

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    // Only Metro's output has content-hashed names; public/ files keep theirs
    const isHashed = /^\/(_expo|assets)\//.test(urlPath);
    res.setHeader(
      'Cache-Control',
      isHashed
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=86400',
    );
    fs.createReadStream(filePath).pipe(res);
  });
}

// Personal or account-only screens
const PRIVATE_PATHS = [
  '/feed',
  '/notifications',
  '/profile',
  '/claims',
  '/verifications',
  '/events',
  '/search',
  '/explore/search',
  '/settings',
  '/moderation',
  '/oauth',
  '/intent',
  '/login',
  '/signup',
  '/anywhere/browser-extension/panel',
  '/_sitemap',
];

// Search engines only get production's public screens
function isIndexable(req) {
  const urlPath = req.url.split('?')[0];
  const isPrivate = PRIVATE_PATHS.some(
    (privatePath) =>
      urlPath === privatePath || urlPath.startsWith(`${privatePath}/`),
  );

  return req.headers.host === appLinks.production.host && !isPrivate;
}

createServer((req, res) => {
  res.setHeader('X-Frame-Options', 'DENY');
  if (!isIndexable(req)) res.setHeader('X-Robots-Tag', 'noindex');
  serveVersion(req, res, () => {
    serveAppLinkFile(req, res, () => {
      serveStatic(req, res, () => {
        handler(req, res, (err) => {
          if (err) {
            console.error(err);
            res.statusCode = 500;
            res.end('Internal Server Error');
          }
        });
      });
    });
  });
}).listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
