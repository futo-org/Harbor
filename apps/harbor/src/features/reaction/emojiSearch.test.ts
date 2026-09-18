import { searchEmojis } from './emojiSearch';

const emojisFor = (query: string) =>
  searchEmojis(query).map((entry) => entry.emoji);

describe('searchEmojis', () => {
  describe('common', () => {
    it('returns nothing for an empty or blank query', () => {
      expect(searchEmojis('')).toEqual([]);
      expect(searchEmojis('   ')).toEqual([]);
    });

    it('returns nothing when nothing matches', () => {
      expect(searchEmojis('qwxv')).toEqual([]);
    });

    it('ignores surrounding whitespace', () => {
      expect(emojisFor('  fire  ')).toEqual(emojisFor('fire'));
      expect(emojisFor(' 👍 ')).toEqual(['👍']);
    });

    it('is case-insensitive', () => {
      expect(emojisFor('FIRE')).toEqual(emojisFor('fire'));
      expect(emojisFor('Grinning Face')).toEqual(emojisFor('grinning face'));
    });

    it('returns each emoji at most once', () => {
      for (const query of ['a', 'face', 'heart', 'flag']) {
        const emojis = emojisFor(query);
        expect(new Set(emojis).size).toBe(emojis.length);
      }
    });

    it('returns the emoji list entries themselves', () => {
      expect(searchEmojis('👍')).toEqual([
        expect.objectContaining({
          emoji: '👍',
          name: 'thumbs up',
          category: 'People & Body',
        }),
      ]);
    });
  });

  describe('emoji matches', () => {
    it('matches a single emoji exactly', () => {
      expect(emojisFor('👍')).toEqual(['👍']);
      expect(emojisFor('🔥')).toEqual(['🔥']);
    });

    it('ignores the variation selector', () => {
      // emojis.json spells red heart without U+FE0F.
      expect(emojisFor('❤️')).toEqual(['❤']);
      expect(emojisFor('❤')).toEqual(['❤']);
    });

    it('maps a skin tone to the base emoji', () => {
      expect(emojisFor('👍🏽')).toEqual(['👍']);
      expect(emojisFor('👋🏿')).toEqual(['👋']);
      expect(emojisFor('🧑🏻‍🚒')).toEqual(['🧑‍🚒']);
    });

    it('matches multi-code-point sequences', () => {
      // ZWJ sequence, family, flag, keycap, black cat
      for (const emoji of ['❤️‍🔥', '👨‍👩‍👧', '🇬🇧', '1️⃣', '🐈‍⬛']) {
        expect(emojisFor(emoji)).toEqual([emoji]);
      }
    });

    it('does not match text mixed with an emoji', () => {
      expect(emojisFor('👍👍')).toEqual([]);
      expect(emojisFor('abc 👍')).toEqual([]);
    });
  });

  describe('name and tag matches', () => {
    it('finds an emoji by its name', () => {
      expect(emojisFor('fire')).toContain('🔥');
      expect(emojisFor('rocket')).toContain('🚀');
      expect(emojisFor('pizza')).toContain('🍕');
      expect(emojisFor('red heart')).toContain('❤');
    });

    // Ranking is fuzzysort's own scoring, nothing here enforces it. These are
    // smoke checks that the obvious answer is not buried.
    it('puts the obvious answer first for a few common queries', () => {
      expect(emojisFor('fire')[0]).toBe('🔥');
      expect(emojisFor('rocket')[0]).toBe('🚀');
      expect(emojisFor('pizza')[0]).toBe('🍕');
      expect(emojisFor('red heart')[0]).toBe('❤');
    });

    it('matches multi-word names', () => {
      expect(emojisFor('grinning face')[0]).toBe('😀');
      expect(emojisFor('tears of joy').slice(0, 2)).toEqual(
        expect.arrayContaining(['😂', '😹']),
      );
      expect(emojisFor('united kingdom')[0]).toBe('🇬🇧');
    });

    it('ranks sibling names together', () => {
      expect(emojisFor('thumb').slice(0, 2)).toEqual(
        expect.arrayContaining(['👍', '👎']),
      );
      expect(emojisFor('crying').slice(0, 3)).toEqual(
        expect.arrayContaining(['😢', '😭', '😿']),
      );
    });

    it('matches emojibase tags, not only the name', () => {
      expect(emojisFor('lol')).toContain('😂');
      expect(emojisFor('coffee')[0]).toBe('☕');
      expect(emojisFor('+1')).toEqual(['👍']);
      expect(emojisFor('poop').slice(0, 2)).toContain('💩');
    });
  });

  describe('fuzzy matches', () => {
    it('matches a prefix of a word', () => {
      expect(emojisFor('rocke')[0]).toBe('🚀');
      expect(emojisFor('smil')).toContain('😊');
      expect(emojisFor('cry').slice(0, 2)).toEqual(
        expect.arrayContaining(['😢', '😿']),
      );
    });

    it('matches words with dropped letters', () => {
      expect(emojisFor('thmbs').slice(0, 2)).toEqual(
        expect.arrayContaining(['👍', '👎']),
      );
      expect(emojisFor('piza')[0]).toBe('🍕');
      expect(emojisFor('pzza')[0]).toBe('🍕');
      expect(emojisFor('rdhrt')[0]).toBe('❤');
    });

    it('matches words run together', () => {
      expect(emojisFor('thumbsup')[0]).toBe('👍');
      expect(emojisFor('thumsup')[0]).toBe('👍');
      expect(emojisFor('redheart')[0]).toBe('❤');
    });

    it('does not match swapped letters (subsequence matching only)', () => {
      // A known fuzzysort limitation, recorded so a change shows up here.
      expect(emojisFor('fier')).not.toContain('🔥');
      expect(emojisFor('haert')).not.toContain('❤');
    });
  });
});
