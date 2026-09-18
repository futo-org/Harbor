import { searchEmojis } from './emojiSearch';

const emojisFor = (query: string) =>
  searchEmojis(query).map((entry) => entry.emoji);

describe('searchEmojis', () => {
  it('returns nothing for an empty or blank query', () => {
    expect(searchEmojis('')).toEqual([]);
    expect(searchEmojis('   ')).toEqual([]);
  });

  it('matches an emoji query exactly', () => {
    expect(emojisFor('👍')).toEqual(['👍']);
    expect(emojisFor(' 👍 ')).toEqual(['👍']);
  });

  it('ignores the variation selector in an emoji query', () => {
    // emojis.json spells red heart without U+FE0F.
    expect(emojisFor('❤️')).toEqual(['❤']);
    expect(emojisFor('❤')).toEqual(['❤']);
  });

  it('maps a skin tone to the base emoji', () => {
    expect(emojisFor('👍🏽')).toEqual(['👍']);
    expect(emojisFor('👋🏿')).toEqual(['👋']);
  });

  it('is case-insensitive', () => {
    expect(emojisFor('FIRE')).toEqual(emojisFor('fire'));
  });

  it('returns each emoji at most once', () => {
    for (const query of ['a', 'face', 'heart']) {
      const emojis = emojisFor(query);
      expect(new Set(emojis).size).toBe(emojis.length);
    }
  });

  it('matches emojibase tags, not only the name', () => {
    // "lol" is a tag of 😂, whose name is "face with tears of joy".
    expect(emojisFor('lol')).toContain('😂');
  });

  it('ranks name matches first', () => {
    expect(emojisFor('fire')[0]).toBe('🔥');
    expect(emojisFor('thumbsup')[0]).toBe('👍');
    expect(emojisFor('thumb').slice(0, 3)).toEqual(
      expect.arrayContaining(['👍', '👎']),
    );
  });
});
