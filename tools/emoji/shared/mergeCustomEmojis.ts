import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import customEmojis from '../custom-emojis.json' with { type: 'json' };
import type { listUnicodeEmojis } from './listUnicodeEmojis.ts';

const customSvgDir = fileURLToPath(new URL('../svg/', import.meta.url));

/**
 * `unicodeEmojis` with the `moved` emoji of `custom-emojis.json` moved, and its
 * custom emoji inserted, after their anchors, in the anchor's category. Custom
 * entries carry their tags and SVG file. Fails on an anchor or moved emoji
 * missing from the list, a custom emoji without an SVG, or an SVG no custom
 * emoji names.
 */
export function mergeCustomEmojis(
  unicodeEmojis: ReturnType<typeof listUnicodeEmojis>,
) {
  const mergedEmojis: {
    emoji: string;
    name: string;
    category: string;
    custom?: { tags: string[]; svgFile: string };
  }[] = [...unicodeEmojis];
  for (const { code, after } of customEmojis.moved) {
    const label = `moved emoji ${code.join(' ')}`;
    const movedIndex = mergedEmojis.findIndex(
      (entry) => entry.emoji === buildEmoji(code),
    );
    if (movedIndex === -1) throw new Error(`${label} not found`);
    const [movedEmoji] = mergedEmojis.splice(movedIndex, 1);
    const anchorIndex = findAnchorIndex(mergedEmojis, label, after);
    mergedEmojis.splice(anchorIndex + 1, 0, {
      ...movedEmoji,
      category: mergedEmojis[anchorIndex].category,
    });
  }
  const svgFileNames = new Set(readdirSync(customSvgDir));
  for (const { code, name, tags, after } of customEmojis.emojis) {
    const svgFileName = `${code.join('-').toLowerCase()}.svg`;
    if (!svgFileNames.delete(svgFileName))
      throw new Error(`custom emoji ${name} has no svg/${svgFileName}`);
    const anchorIndex = findAnchorIndex(
      mergedEmojis,
      `custom emoji ${name}`,
      after,
    );
    mergedEmojis.splice(anchorIndex + 1, 0, {
      emoji: buildEmoji(code),
      name,
      category: mergedEmojis[anchorIndex].category,
      custom: { tags, svgFile: `${customSvgDir}${svgFileName}` },
    });
  }
  if (svgFileNames.size > 0)
    throw new Error(
      `svg/ has files no custom emoji names: ${[...svgFileNames].join(', ')}`,
    );
  return mergedEmojis;
}

function findAnchorIndex(
  emojis: { emoji: string }[],
  label: string,
  after: string[],
) {
  const anchorIndex = emojis.findIndex(
    (entry) => entry.emoji === buildEmoji(after),
  );
  if (anchorIndex === -1)
    throw new Error(`${label}: anchor ${after.join(' ')} not found`);
  return anchorIndex;
}

function buildEmoji(code: string[]) {
  return String.fromCodePoint(...code.map((hex) => Number.parseInt(hex, 16)));
}
