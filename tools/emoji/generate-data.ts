// Writes the picker's emoji, with emojibase's English search tags (custom
// emoji: their own, from custom-emojis.json), to the app's
// `src/common/emoji/pickerEmojis.json`. See README.md.
import { writeFileSync } from 'node:fs';
import emojibaseEmojis from 'emojibase-data/en/compact.json' with {
  type: 'json',
};
import versions from './versions.json' with { type: 'json' };
import { listUnicodeEmojis } from './shared/listUnicodeEmojis.ts';
import { mergeCustomEmojis } from './shared/mergeCustomEmojis.ts';

const outFile = new URL(
  '../../apps/harbor/src/common/emoji/pickerEmojis.json',
  import.meta.url,
);

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

const pickerEmojis: {
  emoji: string;
  name: string;
  category: string;
  tags: string[];
}[] = [];
const unmatchedEmojis: string[] = [];
for (const { emoji, name, category, custom } of mergeCustomEmojis(
  listUnicodeEmojis(versions.unicode.picker),
)) {
  const tags =
    custom?.tags ?? tagsByStrippedEmoji.get(stripVariationSelector(emoji));
  if (!tags) {
    unmatchedEmojis.push(`${emoji} ${name}`);
    continue;
  }
  pickerEmojis.push({ emoji, name, category, tags });
}

if (unmatchedEmojis.length > 0) {
  console.error(
    `${unmatchedEmojis.length} emojis have no emojibase tags:\n  ${unmatchedEmojis.join('\n  ')}`,
  );
  process.exit(1);
}
writeFileSync(outFile, `${JSON.stringify(pickerEmojis)}\n`);
console.log(`Wrote ${outFile.pathname} (${pickerEmojis.length} emojis)`);
