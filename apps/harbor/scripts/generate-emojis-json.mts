// Builds `src/features/reaction/emojis.json`, the picker's emoji list, from
// Unicode's emoji-test.txt. Run with `pnpm generate:emojis-json`.
//
// Uses the fully-qualified spelling of every emoji ("☺️", not "☺"): without
// U+FE0F, text-default emoji render as monochrome glyphs where the platform
// has a text font for them (macOS).
//
// Keeps emoji-test.txt's order, which `publicKeyEmojiFingerprint.ts` depends
// on: a version bump inserts new emoji mid-list and so changes fingerprints.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EMOJI_VERSION = '16.0';

const emojiTestUrl = `https://unicode.org/Public/emoji/${EMOJI_VERSION}/emoji-test.txt`;
const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, '../src/features/reaction/emojis.json');

type EmojiEntry = {
  code: string[];
  emoji: string;
  name: string;
  category: string;
  subcategory: string;
};

const response = await fetch(emojiTestUrl);
if (!response.ok) {
  throw new Error(`Fetching ${emojiTestUrl} failed: ${response.status}`);
}
const emojiEntries = parseEmojiTest(await response.text());

writeFileSync(outFile, `${JSON.stringify({ emojis: emojiEntries })}\n`);
console.log(`Wrote ${outFile} (${emojiEntries.length} emojis)`);

/**
 * One entry per fully-qualified emoji, in file order, without skin tone
 * variants. Of the components, only the hair styles are kept, as the picker
 * skips the Component group anyway.
 */
function parseEmojiTest(emojiTest: string): EmojiEntry[] {
  const emojiEntries: EmojiEntry[] = [];
  let category = '';
  let subcategory = '';

  for (const line of emojiTest.split('\n')) {
    const groupMatch = line.match(/^# (group|subgroup): (.+)$/);
    if (groupMatch) {
      if (groupMatch[1] === 'group') category = groupMatch[2];
      else subcategory = groupMatch[2];
      continue;
    }

    // e.g. "263A FE0F ; fully-qualified # ☺️ E0.6 smiling face"
    const entryMatch = line.match(
      /^([0-9A-F ]+?)\s*;\s*(fully-qualified|component)\s*#\s*\S+\s+E[\d.]+\s+(.+)$/,
    );
    if (!entryMatch) continue;

    const code = entryMatch[1].split(' ');
    if (code.some(isSkinToneModifier)) continue;
    emojiEntries.push({
      code,
      emoji: String.fromCodePoint(
        ...code.map((hex) => Number.parseInt(hex, 16)),
      ),
      name: entryMatch[3],
      category,
      subcategory,
    });
  }

  return emojiEntries;
}

function isSkinToneModifier(hex: string): boolean {
  const codePoint = Number.parseInt(hex, 16);
  return codePoint >= 0x1f3fb && codePoint <= 0x1f3ff;
}
