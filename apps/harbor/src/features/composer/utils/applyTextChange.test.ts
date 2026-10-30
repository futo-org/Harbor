import { applyTextChange, type MentionRange } from './applyTextChange';

const ANN = 'a'.repeat(64);
const BOB = 'b'.repeat(64);

// `@ann.example.com` at 3 and `@Bob Smith` at 20
const TEXT = 'hi @ann.example.com @Bob Smith bye';
const RANGES: MentionRange[] = [
  { start: 3, end: 19, identity: ANN },
  { start: 20, end: 30, identity: BOB },
];

// The change `nextText` makes to TEXT, with what each kept range holds
const change = (nextText: string) => {
  const result = applyTextChange(TEXT, nextText, RANGES);
  return {
    text: result.text,
    caret: result.caret,
    mentions: result.mentionRanges.map((r) => [
      r.identity,
      result.text.slice(r.start, r.end),
    ]),
  };
};

describe('applyTextChange', () => {
  it('passes edits through when there are no mentions', () => {
    expect(applyTextChange('hello', 'hel!lo', [])).toEqual({
      text: 'hel!lo',
      mentionRanges: [],
      caret: 4,
    });
  });

  it('shifts mentions after an edit and keeps the ones before it', () => {
    expect(change('oh hi @ann.example.com @Bob Smith bye')).toEqual({
      text: 'oh hi @ann.example.com @Bob Smith bye',
      caret: 3,
      mentions: [
        [ANN, '@ann.example.com'],
        [BOB, '@Bob Smith'],
      ],
    });
    expect(change('hi @ann.example.com  and @Bob Smith bye').mentions).toEqual([
      [ANN, '@ann.example.com'],
      [BOB, '@Bob Smith'],
    ]);
    expect(change('hi @ann.example.com @Bob Smith').mentions).toEqual([
      [ANN, '@ann.example.com'],
      [BOB, '@Bob Smith'],
    ]);
  });

  it('keeps a mention when typing right at its edges', () => {
    expect(change('hi x@ann.example.com @Bob Smith bye').mentions).toEqual([
      [ANN, '@ann.example.com'],
      [BOB, '@Bob Smith'],
    ]);
    expect(change('hi @ann.example.comx @Bob Smith bye').mentions).toEqual([
      [ANN, '@ann.example.com'],
      [BOB, '@Bob Smith'],
    ]);
    // Deleting the space before or after a mention
    expect(change('hi @ann.example.com@Bob Smith bye').mentions).toEqual([
      [ANN, '@ann.example.com'],
      [BOB, '@Bob Smith'],
    ]);
    expect(change('hi @ann.example.com @Bob Smithbye').mentions).toEqual([
      [ANN, '@ann.example.com'],
      [BOB, '@Bob Smith'],
    ]);
  });

  it('keeps a mention when the typed char repeats its edge char', () => {
    // An `@` before `@ann`, or an `m` after `.com`, could be placed inside
    expect(change('hi @@ann.example.com @Bob Smith bye')).toEqual({
      text: 'hi @@ann.example.com @Bob Smith bye',
      caret: 4,
      mentions: [
        [ANN, '@ann.example.com'],
        [BOB, '@Bob Smith'],
      ],
    });
    expect(change('hi @ann.example.comm @Bob Smith bye').mentions).toEqual([
      [ANN, '@ann.example.com'],
      [BOB, '@Bob Smith'],
    ]);
  });

  it('deletes a whole mention when deleting any of its chars', () => {
    for (const nextText of [
      'hi @ann.example.co @Bob Smith bye',
      'hi ann.example.com @Bob Smith bye',
      'hi @ann.exmple.com @Bob Smith bye',
    ]) {
      expect(change(nextText)).toEqual({
        text: 'hi  @Bob Smith bye',
        caret: 3,
        mentions: [[BOB, '@Bob Smith']],
      });
    }
  });

  it('replaces a whole mention when typing inside it', () => {
    expect(change('hi @ann.exaxmple.com @Bob Smith bye')).toEqual({
      text: 'hi x @Bob Smith bye',
      caret: 4,
      mentions: [[BOB, '@Bob Smith']],
    });
  });

  it('replaces every mention a selection reaches into', () => {
    // Selecting `example.com @Bob` and pasting `them`
    expect(change('hi @ann.them Smith bye')).toEqual({
      text: 'hi them bye',
      caret: 7,
      mentions: [],
    });
    // Selecting both mentions exactly
    expect(change('hi them bye')).toEqual({
      text: 'hi them bye',
      caret: 7,
      mentions: [],
    });
    expect(change('')).toEqual({ text: '', caret: 0, mentions: [] });
  });

  it('keeps every mention intact through random edits', () => {
    // Deterministic pseudo-random sequence (LCG)
    let seed = 1;
    const random = (below: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % below;
    };
    const mentionTextByIdentity: Record<string, string> = {
      [ANN]: '@ann.example.com',
      [BOB]: '@Bob Smith',
    };
    const pieces = ['', 'x', '@', 'm', ' ', '@ann', 'Smith', 'ab cd'];

    for (let run = 0; run < 200; run++) {
      let text = TEXT;
      let ranges = RANGES;
      for (let step = 0; step < 10; step++) {
        const from = random(text.length + 1);
        const to = from + random(Math.min(5, text.length - from) + 1);
        const nextText =
          text.slice(0, from) + pieces[random(pieces.length)] + text.slice(to);
        ({ text, mentionRanges: ranges } = applyTextChange(
          text,
          nextText,
          ranges,
        ));
        for (const r of ranges) {
          expect(text.slice(r.start, r.end)).toBe(
            mentionTextByIdentity[r.identity],
          );
        }
      }
    }
  });
});
