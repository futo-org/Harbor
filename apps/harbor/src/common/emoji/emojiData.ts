import type { IconName } from '@/src/common/components/Icon';
import emojiData from './emojis.json';

export type EmojiEntry = {
  emoji: string;
  name: string;
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

export const categories: EmojiCategory[] = emojiData.categories.map(
  ({ key, emojis }) => {
    const icon = CATEGORY_ICON_BY_KEY[key];
    if (!icon) throw new Error(`No rail icon for emoji category "${key}"`);
    return { key, icon, emojis };
  },
);

const categoryByKey: Record<string, EmojiCategory> = {};
for (const c of categories) {
  categoryByKey[c.key] = c;
}

export function getCategory(key: string): EmojiCategory | undefined {
  return categoryByKey[key];
}

export const INLINE_EMOJIS: { emoji: string; name: string }[] = [
  { emoji: '❤️', name: 'red heart' },
  { emoji: '😂', name: 'face with tears of joy' },
  { emoji: '🤣', name: 'rolling on the floor laughing' },
  { emoji: '😍', name: 'smiling face with heart-eyes' },
  { emoji: '👍', name: 'thumbs up' },
  { emoji: '💪', name: 'flexed biceps' },
];
