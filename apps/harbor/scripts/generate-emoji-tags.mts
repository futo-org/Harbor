// Fuses the emoji list in `src/features/reaction/emojis.json` with emojibase's
// English search tags and writes `src/features/reaction/emojiTags.json`,
// a flat object of emoji -> tags. Run with `pnpm generate:emoji-tags`.
//
// `emojis.json` is only read, never rewritten: it stays the single source of
// the emoji list and its order, which `publicKeyEmojiFingerprint.ts` depends
// on. Keys are copied from it verbatim so the app can look tags up with no
// normalization. Only the tags are copied; the name stays in `emojis.json`.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import emojibaseEmojis from 'emojibase-data/en/compact.json' with {
  type: 'json',
};
import emojiList from '../src/features/reaction/emojis.json' with {
  type: 'json',
};

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, '../src/features/reaction/emojiTags.json');

// The two sources spell some emojis differently (❤ vs ❤️), so match them with
// the variation selector stripped on both sides.
function stripVariationSelector(emoji: string): string {
  return emoji.replace(/️/g, '');
}

const tagsByStrippedEmoji = new Map<string, string[]>();
for (const emojibaseEmoji of emojibaseEmojis) {
  if (!emojibaseEmoji.tags) continue;
  tagsByStrippedEmoji.set(
    stripVariationSelector(emojibaseEmoji.unicode),
    emojibaseEmoji.tags,
  );
}

const tagsByEmoji: Record<string, string[]> = {};
const unmatchedEmojis: string[] = [];
for (const entry of emojiList.emojis) {
  // Skin tone and hair style modifiers, skipped by the picker as well.
  if (entry.category === 'Component') continue;
  const tags = tagsByStrippedEmoji.get(stripVariationSelector(entry.emoji));
  if (!tags) {
    unmatchedEmojis.push(`${entry.emoji} ${entry.name}`);
    continue;
  }
  tagsByEmoji[entry.emoji] = tags;
}

writeFileSync(outFile, `${JSON.stringify(tagsByEmoji)}\n`);
console.log(`Wrote ${outFile} (${Object.keys(tagsByEmoji).length} emojis)`);
if (unmatchedEmojis.length > 0) {
  console.warn(
    `${unmatchedEmojis.length} emojis have no emojibase tags:\n  ${unmatchedEmojis.join('\n  ')}`,
  );
}
