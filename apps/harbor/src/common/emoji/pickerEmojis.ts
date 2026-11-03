import type { IconName } from '@/src/common/components/Icon';
import pickerEmojisJson from './pickerEmojis.json';

export type EmojiEntry = {
  emoji: string;
  name: string;
  category: string;
  tags: string[];
};

export type EmojiCategory = {
  key: string;
  icon: IconName;
  emojis: EmojiEntry[];
};

// Keyed by the slug of the Unicode group name; the groups are fixed by the
// standard, so a group missing here is a bug rather than new data.
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

/** Every pickable emoji, in picker order. */
export const pickerEmojis: EmojiEntry[] = pickerEmojisJson;

export const emojiCategoryByKeyMap = new Map<string, EmojiCategory>();
for (const entry of pickerEmojis) {
  let category = emojiCategoryByKeyMap.get(entry.category);
  if (!category) {
    const icon = CATEGORY_ICON_BY_KEY[entry.category];
    if (!icon)
      throw new Error(`No rail icon for emoji category "${entry.category}"`);
    category = { key: entry.category, icon, emojis: [] };
    emojiCategoryByKeyMap.set(entry.category, category);
  }
  category.emojis.push(entry);
}

export const emojiCategories: EmojiCategory[] = [
  ...emojiCategoryByKeyMap.values(),
];
