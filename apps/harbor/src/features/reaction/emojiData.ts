import type { IconName } from '@/src/common/components/Icon';
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
  icon: IconName;
  emojis: EmojiEntry[];
};

// Keyed by the slug derived from the Unicode group name; the groups are fixed
// by the standard, so a group missing here is a bug rather than new data.
const CATEGORY_ICON_BY_KEY: Record<string, IconName> = {
  'smileys-emotion': 'emoticonHappy',
  'people-body': 'handWave',
  'animals-nature': 'paw',
  'food-drink': 'foodApple',
  'travel-places': 'airplane',
  activities: 'basketball',
  objects: 'lightbulb',
  symbols: 'pound',
  flags: 'flagAlt',
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

  return Array.from(map.entries()).map(([name, emojis]) => {
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const icon = CATEGORY_ICON_BY_KEY[key];
    if (!icon) throw new Error(`No rail icon for emoji category "${name}"`);
    return { key, name, icon, emojis };
  });
}

export const categories: EmojiCategory[] = groupByCategory();

const categoryByKey: Record<string, EmojiCategory> = {};
for (const c of categories) {
  categoryByKey[c.key] = c;
}

export function getCategory(key: string): EmojiCategory | undefined {
  return categoryByKey[key];
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
