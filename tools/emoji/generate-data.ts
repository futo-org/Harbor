// Writes the picker's emoji, with emojibase's English search tags, to the
// app's `src/common/emoji/emojis.json`. See README.md.
import { writeFileSync } from 'node:fs';
import emojibaseEmojis from 'emojibase-data/en/compact.json' with {
  type: 'json',
};
import versions from './versions.json' with { type: 'json' };
import { listUnicodeEmojis } from './shared/listUnicodeEmojis.ts';

const outFile = new URL(
  '../../apps/harbor/src/common/emoji/emojis.json',
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

type Category = {
  key: string;
  emojis: { emoji: string; name: string; tags: string[] }[];
};

const categories: Category[] = [];
const unmatchedEmojis: string[] = [];
for (const { emoji, name, category: key } of listUnicodeEmojis(
  versions.unicode.picker,
)) {
  const tags = tagsByStrippedEmoji.get(stripVariationSelector(emoji));
  if (!tags) {
    unmatchedEmojis.push(`${emoji} ${name}`);
    continue;
  }
  let category = categories.at(-1);
  if (category?.key !== key) {
    category = { key, emojis: [] };
    categories.push(category);
  }
  category.emojis.push({ emoji, name, tags });
}

if (unmatchedEmojis.length > 0) {
  console.error(
    `${unmatchedEmojis.length} emojis have no emojibase tags:\n  ${unmatchedEmojis.join('\n  ')}`,
  );
  process.exit(1);
}
writeFileSync(outFile, `${JSON.stringify({ categories })}\n`);
console.log(
  `Wrote ${outFile.pathname} (${categories.flatMap((category) => category.emojis).length} emojis)`,
);
