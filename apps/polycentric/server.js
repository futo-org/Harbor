const path = require('node:path');
const fs = require('node:fs');
const { createServer } = require('node:http');
const { createRequestHandler } = require('expo-server/vendor/http');

const CLIENT_DIR = path.join(__dirname, 'dist', 'client');
const handler = createRequestHandler({
  build: path.join(__dirname, 'dist', 'server'),
});
const port = process.env.PORT || 3000;

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
