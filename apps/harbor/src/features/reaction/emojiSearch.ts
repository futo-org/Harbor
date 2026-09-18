import fuzzysort, { type SnapshotKeys } from 'fuzzysort';
import { categories, type EmojiEntry } from './emojiData';
import emojiTags from './emojiTags.json';

/**
 * Emojis matching `query`, best first. Fuzzy over the name and the emojibase
 * tags (see `scripts/generate-emoji-tags.mts`), or an exact match when the
 * query is an emoji itself.
 */
export function searchEmojis(query: string): EmojiEntry[] {
  const trimmedQuery = query.trim();
  if (trimmedQuery === '') return [];

  const exactEntry = getEntryByEmojiMap().get(normalizeEmoji(trimmedQuery));
  if (exactEntry) return [exactEntry];

  return fuzzysort
    .go(trimmedQuery, getSearchIndex(), { limit: 0, threshold: 0 })
    .map((result) => result.obj.entry);
}

type SearchableEmoji = {
  entry: EmojiEntry;
  name: string;
  tags: string;
};

const tagsByEmoji = emojiTags as Record<string, string[] | undefined>;

const allEntries: EmojiEntry[] = categories.flatMap(
  (category) => category.emojis,
);

// Built on the first search rather than at import: `emojiData` is also loaded
// by the fingerprint code, and preparing the targets is not free on low-end
// phones.
let searchIndex: SnapshotKeys<SearchableEmoji> | undefined;

function getSearchIndex(): SnapshotKeys<SearchableEmoji> {
  if (!searchIndex) {
    const searchableEmojis = allEntries.map(
      (entry): SearchableEmoji => ({
        entry,
        name: entry.name,
        tags: (tagsByEmoji[entry.emoji] ?? []).join(' '),
      }),
    );
    searchIndex = fuzzysort.snapshot(searchableEmojis, {
      keys: ['name', 'tags'],
    });
  }
  return searchIndex;
}

let entryByNormalizedEmojiMap: Map<string, EmojiEntry> | undefined;

function getEntryByEmojiMap(): Map<string, EmojiEntry> {
  if (!entryByNormalizedEmojiMap) {
    entryByNormalizedEmojiMap = new Map(
      allEntries.map((entry) => [normalizeEmoji(entry.emoji), entry]),
    );
  }
  return entryByNormalizedEmojiMap;
}

// U+FE0F (variation selector) and U+1F3FB..U+1F3FF (skin tone modifiers).
const IGNORED_EMOJI_CODE_POINTS = /️|[\u{1F3FB}-\u{1F3FF}]/gu;

/** Maps spelling variants and skin tones to the base emoji in the list. */
function normalizeEmoji(emoji: string): string {
  return emoji.replace(IGNORED_EMOJI_CODE_POINTS, '');
}
