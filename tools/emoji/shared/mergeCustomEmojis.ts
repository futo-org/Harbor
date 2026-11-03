import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import customEmojis from '../custom-emojis.json' with { type: 'json' };
import type { listUnicodeEmojis } from './listUnicodeEmojis.ts';

const customSvgDir = fileURLToPath(new URL('../svg/', import.meta.url));

/**
 * `unicodeEmojis` with the emoji of `custom-emojis.json` inserted after their
 * anchors, in the anchor's category. Custom entries carry their tags and SVG
 * file. Fails on an anchor missing from the list, a custom emoji without an
 * SVG, or an SVG no custom emoji names.
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
  const svgFileNames = new Set(readdirSync(customSvgDir));
  for (const { code, name, tags, after } of customEmojis.emojis) {
    const svgFileName = `${code.join('-').toLowerCase()}.svg`;
    if (!svgFileNames.delete(svgFileName))
      throw new Error(`custom emoji ${name} has no svg/${svgFileName}`);
    const anchor = String.fromCodePoint(
      ...after.map((hex) => Number.parseInt(hex, 16)),
    );
    const anchorIndex = mergedEmojis.findIndex(
      (entry) => entry.emoji === anchor,
    );
    if (anchorIndex === -1)
      throw new Error(
        `custom emoji ${name}: anchor ${after.join(' ')} not found`,
      );
    mergedEmojis.splice(anchorIndex + 1, 0, {
      emoji: String.fromCodePoint(
        ...code.map((hex) => Number.parseInt(hex, 16)),
      ),
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
