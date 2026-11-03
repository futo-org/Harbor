// Writes the pairing fingerprint's emoji pool to the app's
// `src/common/emoji/fingerprintEmojis.json`. Run once: both devices must pick
// from the same pool, so it never changes. See README.md.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import versions from './versions.json' with { type: 'json' };
import { listUnicodeEmojis } from './shared/listUnicodeEmojis.ts';

const FINGERPRINT_CATEGORIES = new Set([
  'smileys-emotion',
  'animals-nature',
  'food-drink',
  'travel-places',
  'activities',
  'objects',
]);

// SHA-256 of the minified array the app shipped before the pool was frozen.
const FINGERPRINT_EMOJIS_SHA256 =
  '203abb3b50ff0934fbdb5f2510484486c0a30675f8641ae0d794686da072ad72';

const outFile = new URL(
  '../../apps/harbor/src/common/emoji/fingerprintEmojis.json',
  import.meta.url,
);

const fingerprintEmojis = listUnicodeEmojis(versions.unicode.fingerprint)
  .filter(({ category }) => FINGERPRINT_CATEGORIES.has(category))
  .map(({ emoji }) => emoji);
const fingerprintEmojisJson = JSON.stringify(fingerprintEmojis);
const sha256 = createHash('sha256').update(fingerprintEmojisJson).digest('hex');
if (sha256 !== FINGERPRINT_EMOJIS_SHA256) {
  console.error(`Pool SHA-256 ${sha256} is not ${FINGERPRINT_EMOJIS_SHA256}`);
  process.exit(1);
}
writeFileSync(outFile, `${fingerprintEmojisJson}\n`);
console.log(`Wrote ${outFile.pathname} (${fingerprintEmojis.length} emojis)`);
