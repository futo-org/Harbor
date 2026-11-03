// Downloads everything the scripts read into `downloads/` (gitignored), for
// the versions in `versions.json`: the Twemoji release and Unicode's emoji
// data. Always starts from scratch. See README.md.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import versions from './versions.json' with { type: 'json' };

const downloadsDir = fileURLToPath(new URL('downloads/', import.meta.url));
rmSync(downloadsDir, { recursive: true, force: true });

const twemojiDir = `${downloadsDir}twemoji/${versions.twemoji}/`;
mkdirSync(twemojiDir, { recursive: true });
const archiveRoot = `twemoji-${versions.twemoji}`;
// tar keeps each file's time, the release commit's, which generate-font.py
// stamps the fonts with.
execFileSync(
  'tar',
  [
    '-xz',
    '-C',
    twemojiDir,
    '--strip-components=1',
    `${archiveRoot}/package.json`,
    `${archiveRoot}/assets/svg`,
  ],
  {
    input: await download(
      `https://github.com/jdecked/twemoji/archive/refs/tags/v${versions.twemoji}.tar.gz`,
    ),
  },
);
for (const unicodeVersion of new Set(Object.values(versions.unicode))) {
  const unicodeDir = `${downloadsDir}unicode/${unicodeVersion}/`;
  mkdirSync(unicodeDir, { recursive: true });
  // Unicode moved the emoji data into each version's own folder in 17.0.
  writeFileSync(
    `${unicodeDir}emoji-test.txt`,
    await download(
      Number.parseInt(unicodeVersion, 10) < 17
        ? `https://www.unicode.org/Public/emoji/${unicodeVersion}/emoji-test.txt`
        : `https://www.unicode.org/Public/${unicodeVersion}.0/emoji/emoji-test.txt`,
    ),
  );
  writeFileSync(
    `${unicodeDir}emoji-variation-sequences.txt`,
    await download(
      `https://www.unicode.org/Public/${unicodeVersion}.0/ucd/emoji/emoji-variation-sequences.txt`,
    ),
  );
}
console.log(`Downloaded into ${downloadsDir}`);

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
