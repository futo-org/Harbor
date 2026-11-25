// The bindgen writes relative imports without a file extension, which a
// bundler resolves but node's ESM loader does not. Add `.js` to the emitted
// node build, and copy the wasm-bindgen glue tsc has no reason to touch.
import { copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const generated = 'src/generated/wasm';
const nodeDir = 'dist/node';

const RELATIVE_IMPORT = /(\bfrom\s+["'])(\.\.?\/[^"']+)(["'])/g;

for (const entry of await readdir(nodeDir, {
  recursive: true,
  withFileTypes: true,
})) {
  if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
  const path = join(entry.parentPath, entry.name);
  const source = await readFile(path, 'utf8');
  const fixed = source.replace(RELATIVE_IMPORT, (match, open, spec, close) =>
    /\.[cm]?js$/.test(spec) ? match : `${open}${spec}.js${close}`,
  );
  if (fixed !== source) await writeFile(path, fixed);
}

for (const file of await readdir(generated)) {
  if (file.endsWith('_bg.js')) {
    await copyFile(
      join(generated, file),
      join(nodeDir, 'generated/wasm', file),
    );
  }
}
