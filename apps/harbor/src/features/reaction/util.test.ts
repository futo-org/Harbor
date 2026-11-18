import type { ReactionGroup } from './usePostReactions';
import { summarizeReactions } from './util';

describe('summarizeReactions', () => {
  it("orders lines by the user's emoji, then tally, then untallied emojis", () => {
    const groups = buildGroups([
      ['😂', ['me', 'dave']],
      ['🎉', ['erin']],
      ['👍', ['alice']],
    ]);
    const counts = [
      { emoji: '❤️', count: 4 },
      { emoji: '🔥', count: 2 },
      { emoji: '😂', count: 2 },
      { emoji: '👍', count: 1 },
    ];

    const { lines } = summarizeReactions(groups, counts, 'me', 10);

    expect(lines.map((line) => line.emoji)).toEqual([
      '😂',
      '❤️',
      '🔥',
      '👍',
      '🎉',
    ]);
    expect(lines[1]).toEqual({
      emoji: '❤️',
      includesMe: false,
      othersCount: 4,
    });
  });

  it('names the most recent reactor and counts the rest from the tally', () => {
    const groups = buildGroups([['👍', ['alice', 'bob', 'carol']]]);

    const { lines } = summarizeReactions(
      groups,
      [{ emoji: '👍', count: 15 }],
      'me',
      10,
    );

    expect(lines).toEqual([
      { emoji: '👍', includesMe: false, identity: 'alice', othersCount: 14 },
    ]);
  });

  it('names a reactor besides the user', () => {
    const groups = buildGroups([['👍', ['me', 'alice', 'bob']]]);

    const { lines } = summarizeReactions(
      groups,
      [{ emoji: '👍', count: 15 }],
      'me',
      10,
    );

    expect(lines).toEqual([
      { emoji: '👍', includesMe: true, identity: 'alice', othersCount: 13 },
    ]);
  });

  it('counts fetched reactions when the tally lags behind', () => {
    const groups = buildGroups([['👍', ['alice', 'bob']]]);

    const { lines } = summarizeReactions(
      groups,
      [{ emoji: '👍', count: 1 }],
      'me',
      10,
    );

    expect(lines[0].othersCount).toBe(1);
  });

  it('cuts off lines past the limit and counts their people', () => {
    const groups = buildGroups([
      ['😂', ['carol']],
      ['👍', ['alice']],
    ]);
    const counts = [
      { emoji: '👍', count: 5 },
      { emoji: '❤️', count: 4 },
      { emoji: '😂', count: 2 },
      { emoji: '🔥', count: 1 },
    ];

    const { lines, morePeopleCount } = summarizeReactions(
      groups,
      counts,
      'me',
      2,
    );

    expect(lines.map((line) => line.emoji)).toEqual(['👍', '❤️']);
    expect(morePeopleCount).toBe(3);
  });
});

function buildGroups(
  entries: [emoji: string, identities: string[]][],
): Map<string, ReactionGroup> {
  return new Map(
    entries.map(([emoji, identities]) => [
      emoji,
      {
        emoji,
        reactions: identities.map((identity) => ({ identity, emoji })),
      },
    ]),
  );
}
