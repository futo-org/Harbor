import { Spacing } from '@/src/common/theme';
import rawData from './emojis.json';

export type EmojiEntry = {
  code: string[];
  emoji: string;
  name: string;
  category: string;
  subcategory: string;
};

export type EmojiCategory = {
  key: string;
  name: string;
  icon: string;
  emojis: EmojiEntry[];
};

const data = rawData as { emojis: EmojiEntry[] };

/** Group emojis by category, preserving the order they appear in. */
function groupByCategory(): EmojiCategory[] {
  const map = new Map<string, EmojiEntry[]>();

  for (const entry of data.emojis) {
    if (entry.category === 'Component') continue;
    let list = map.get(entry.category);
    if (!list) {
      list = [];
      map.set(entry.category, list);
    }
    list.push(entry);
  }

  return Array.from(map.entries()).map(([name, emojis]) => ({
    key: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    icon: emojis[0]!.emoji,
    emojis,
  }));
}

export const categories: EmojiCategory[] = groupByCategory();

const categoryByKey: Record<string, EmojiCategory> = {};
for (const c of categories) {
  categoryByKey[c.key] = c;
}

export function getCategory(key: string): EmojiCategory | undefined {
  return categoryByKey[key];
}

export const DEFAULT_GRID_COLUMNS = 10;
export type EmojiListItem =
  | { type: 'header'; key: string; categoryKey: string; hidden?: boolean }
  | { type: 'row'; key: string; categoryKey: string; emojis: EmojiEntry[] };

export function buildRows(columns: number): EmojiListItem[] {
  const items: EmojiListItem[] = [];

  categories.forEach((c, i) => {
    items.push({
      type: 'header',
      key: `h:${c.key}`,
      categoryKey: c.key,
      // We render an invisible section divider at the top, because `FlashList`
      // needs to measure its size for accurate scroll offsets.
      hidden: i === 0,
    });

    for (let j = 0; j < c.emojis.length; j += columns) {
      items.push({
        type: 'row',
        key: `r:${c.key}:${j}`,
        categoryKey: c.key,
        emojis: c.emojis.slice(j, j + columns),
      });
    }
  });

  return items;
}

export const INLINE_EMOJIS: { code: string[]; emoji: string; name: string }[] =
  [
    { code: ['2764'], emoji: '❤️', name: 'red heart' },
    { code: ['1F602'], emoji: '😂', name: 'face with tears of joy' },
    { code: ['1F923'], emoji: '🤣', name: 'rolling on the floor laughing' },
    { code: ['1F60D'], emoji: '😍', name: 'smiling face with heart-eyes' },
    { code: ['1F44D'], emoji: '👍', name: 'thumbs up' },
    { code: ['1F4AA'], emoji: '💪', name: 'flexed biceps' },
  ];

export const EMOJI_FONT_SIZE = 26;
export const SECTION_RULE_PADDING = Spacing.xs;
export const HEADER_HEIGHT = 2 * SECTION_RULE_PADDING + 1;

/**
 * Compute section scroll offsets from the rendered row and header heights, so
 * that we don't rely on full `FlashList` renders to scroll to sections. Should
 * match `buildRows`.
 */
export function computeSectionOffsets(
  rowHeight: number,
  headerHeight: number = HEADER_HEIGHT,
  columns: number = DEFAULT_GRID_COLUMNS,
): Record<string, number> {
  const offsets: Record<string, number> = {};
  let y = 0;

  for (const c of categories) {
    offsets[c.key] = y;
    y += headerHeight;
    const rows = Math.ceil(c.emojis.length / columns);
    y += rows * rowHeight;
  }

  return offsets;
}
