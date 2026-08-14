// Upload an exported web bundle to the static bucket:
//   node publish-web-assets.mjs <srcDir> <destPrefix>
// Filenames are content-hashed, so uploads are additive and immutable.

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { createStaticBucket } from '../../../tools/static-bucket/index.js';

const [srcDir, destPrefix] = process.argv.slice(2);
if (!srcDir || !destPrefix) {
  console.error('usage: publish-web-assets.mjs <srcDir> <destPrefix>');
  process.exit(1);
}

const bucket = createStaticBucket();

const CONTENT_TYPES = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

let uploaded = 0;
for (const entry of readdirSync(srcDir, {
  recursive: true,
  withFileTypes: true,
})) {
  if (!entry.isFile()) continue;
  const file = path.join(entry.parentPath, entry.name);
  const relative = path.relative(srcDir, file).split(path.sep).join('/');
  const contentType =
    CONTENT_TYPES[path.extname(entry.name)] || 'application/octet-stream';
  bucket.put(
    `${destPrefix}/${relative}`,
    file,
    contentType,
    'public, max-age=31536000, immutable',
  );
  uploaded += 1;
}

if (uploaded === 0) {
  console.error(`no files found under ${srcDir}`);
  process.exit(1);
}
console.log(`published ${uploaded} files to ${destPrefix}/`);
