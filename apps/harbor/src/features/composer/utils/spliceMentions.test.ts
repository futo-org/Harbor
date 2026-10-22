import { spliceMentions } from './spliceMentions';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

describe('spliceMentions', () => {
  it('turns every range into the curly form, in any order', () => {
    expect(
      spliceMentions('hi @Jane Doe and @ann.example.com!', [
        { start: 17, end: 33, identity: B },
        { start: 3, end: 12, identity: A },
      ]),
    ).toBe(`hi @{${A},Jane Doe} and @{${B},ann.example.com}!`);
  });

  it('leaves text outside ranges alone, mention-like or not', () => {
    expect(spliceMentions('hi @ann.example.com', [])).toBe(
      'hi @ann.example.com',
    );
  });
});
