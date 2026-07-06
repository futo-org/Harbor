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

/**
 * Group emojis by category, preserving original order from the JSON.
 */
function groupByCategory(): EmojiCategory[] {
  const map = new Map<string, EmojiEntry[]>();

  for (const entry of data.emojis) {
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
