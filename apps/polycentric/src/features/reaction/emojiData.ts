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

export type PickerItem =
  | { type: 'header'; categoryKey: string; first: boolean }
  | { type: 'row'; categoryKey: string; emojis: EmojiEntry[] };

const data = rawData as { emojis: EmojiEntry[] };

/**
 * Group emojis by category, preserving original order from the JSON.
 */
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
for (const cat of categories) {
  categoryByKey[cat.key] = cat;
}

export function getCategory(key: string): EmojiCategory | undefined {
  return categoryByKey[key];
}

/**
 * Build an array of emoji rows for the emoji picker suitable for a
 * `FlashList`. (The `FlashList` would not be able to virtualize individual
 * emoji buttons.) Additionally, return a lookup table from category key
 * to the index of that category's start in the list.
 *
 * Each category emits one header item followed by as many row items as
 * needed to hold its emojis chunked at `columns` per row.
 *
 * Note that the first header will include a field `first: true`.
 */
export function buildEmojiItems(
  categories: EmojiCategory[],
  columns: number,
): { items: PickerItem[]; sectionIndex: Record<string, number> } {
  const items: PickerItem[] = [];
  const sectionIndex: Record<string, number> = {};

  for (let i = 0; i < categories.length; i++) {
    const c = categories[i]!;
    sectionIndex[c.key] = items.length;
    items.push({ type: 'header', categoryKey: c.key, first: i === 0 });

    const emojis = c.emojis;
    for (let j = 0; j < emojis.length; j += columns) {
      items.push({
        type: 'row',
        categoryKey: c.key,
        emojis: emojis.slice(j, j + columns),
      });
    }
  }

  return { items, sectionIndex };
}
