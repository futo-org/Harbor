import { splitByMentionRanges } from './splitByMentionRanges';

const ANN = 'a'.repeat(64);
const BOB = 'b'.repeat(64);

describe('splitByMentionRanges', () => {
  it('returns the whole text as one plain segment without mentions', () => {
    expect(splitByMentionRanges('hello', [])).toEqual([
      { text: 'hello', isMention: false },
    ]);
    expect(splitByMentionRanges('', [])).toEqual([]);
  });

  it('cuts plain text around mentions, in text order', () => {
    const text = 'hi @Ann and @Bob Smith bye';
    // Bob was inserted first
    const ranges = [
      { start: 12, end: 22, identity: BOB },
      { start: 3, end: 7, identity: ANN },
    ];
    expect(splitByMentionRanges(text, ranges)).toEqual([
      { text: 'hi ', isMention: false },
      { text: '@Ann', isMention: true },
      { text: ' and ', isMention: false },
      { text: '@Bob Smith', isMention: true },
      { text: ' bye', isMention: false },
    ]);
  });

  it('has no empty plain segments at the edges or between adjacent mentions', () => {
    const text = '@Ann@Bob';
    const ranges = [
      { start: 0, end: 4, identity: ANN },
      { start: 4, end: 8, identity: BOB },
    ];
    expect(splitByMentionRanges(text, ranges)).toEqual([
      { text: '@Ann', isMention: true },
      { text: '@Bob', isMention: true },
    ]);
  });
});
