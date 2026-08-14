const path = require('node:path');
const fs = require('node:fs');
const { createServer } = require('node:http');
const { createRequestHandler } = require('expo-server/vendor/http');

const CLIENT_DIR = path.join(__dirname, 'dist', 'client');
const handler = createRequestHandler({
  build: path.join(__dirname, 'dist', 'server'),
});
const port = process.env.PORT || 8080;

// Any EXPO_PUBLIC_* set on the container overrides the baked-in value.
const runtimeEnv = {};
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith('EXPO_PUBLIC_')) runtimeEnv[key] = value;
}
// SSR reads the same global.
globalThis.__POLYCENTRIC_ENV__ = runtimeEnv;

// Base URL for the exported bundle (e.g. the static CDN). CI uploads the
// same /_expo and /assets tree under it and rewrites the js/css to match.
const assetsBaseUrl = (process.env.POLYCENTRIC_STATIC_ASSETS_URL || '').replace(
  /\/$/,
  '',
);

// Substitute the runtime env into the +html.tsx script of every exported
// HTML template. Matches the whole assignment, so restarts re-patch.
const DIST_DIR = path.join(__dirname, 'dist');
for (const entry of fs.readdirSync(DIST_DIR, {
  recursive: true,
  withFileTypes: true,
})) {
  if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
  const file = path.join(entry.parentPath, entry.name);
  const html = fs.readFileSync(file, 'utf8');
  let patched = html.replace(
    /globalThis\.__POLYCENTRIC_ENV__ = [^<]*/,
    () => `globalThis.__POLYCENTRIC_ENV__ = ${JSON.stringify(runtimeEnv)};`,
  );
  if (assetsBaseUrl) {
    patched = patched.replace(
      /(src|href)="\/(_expo|assets)\//g,
      `$1="${assetsBaseUrl}/$2/`,
    );
  }
  if (patched !== html) fs.writeFileSync(file, patched);
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

function serveStatic(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(CLIENT_DIR, urlPath);

  if (!filePath.startsWith(CLIENT_DIR)) return next();

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) return next();

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    fs.createReadStream(filePath).pipe(res);
  });
}

createServer((req, res) => {
  serveStatic(req, res, () => {
    handler(req, res, (err) => {
      if (err) {
        console.error(err);
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    });
  });
}).listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
