import { rewriteMentions } from './rewriteMentions';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const JANE = { [A]: { identity: A, renderAs: 'Jane' } };
// A domain-only alias and one with an account name, which must behave the same.
const ANN = { 'ann.example.com': { identity: B, renderAs: 'ann.example.com' } };
const BOB = { 'bob@example.com': { identity: C, renderAs: 'bob@example.com' } };

describe('rewriteMentions', () => {
  it('rewrites a remembered identity mention to the curly form', () => {
    expect(rewriteMentions(`hi @${A} bye`, JANE)).toBe(`hi @{${A},Jane} bye`);
  });

  it('rewrites a remembered alias mention to the curly form', () => {
    expect(rewriteMentions('hi @ann.example.com bye', ANN)).toBe(
      `hi @{${B},ann.example.com} bye`,
    );
    expect(rewriteMentions('hi @bob@example.com bye', BOB)).toBe(
      `hi @{${C},bob@example.com} bye`,
    );
  });

  it('leaves unremembered mentions and deleted mentions alone', () => {
    expect(rewriteMentions(`hi @${B}`, JANE)).toBe(`hi @${B}`);
    expect(rewriteMentions('hi @bob.example.com', ANN)).toBe(
      'hi @bob.example.com',
    );
    expect(rewriteMentions('hi @ann@example.com', BOB)).toBe(
      'hi @ann@example.com',
    );
    expect(rewriteMentions('hi there', JANE)).toBe('hi there');
  });

  it('rewrites every occurrence and several mentions', () => {
    expect(
      rewriteMentions(`@${A} @ann.example.com @bob@example.com @${A}`, {
        ...JANE,
        ...ANN,
        ...BOB,
      }),
    ).toBe(
      `@{${A},Jane} @{${B},ann.example.com} @{${C},bob@example.com} @{${A},Jane}`,
    );
  });

  it('handles start, end, newline and trailing punctuation like the parser', () => {
    expect(rewriteMentions(`@${A}\n@${A}.`, JANE)).toBe(
      `@{${A},Jane}\n@{${A},Jane}.`,
    );
    expect(rewriteMentions('(@ann.example.com).', ANN)).toBe(
      `(@{${B},ann.example.com}).`,
    );
    expect(rewriteMentions('(@bob@example.com).', BOB)).toBe(
      `(@{${C},bob@example.com}).`,
    );
  });

  it('leaves what the parser does not treat as a mention', () => {
    expect(rewriteMentions(`user@${A}`, JANE)).toBe(`user@${A}`);
    expect(rewriteMentions(`@${A}f`, JANE)).toBe(`@${A}f`);
    expect(rewriteMentions(`@{${A},Old}`, JANE)).toBe(`@{${A},Old}`);
    expect(rewriteMentions('@ann.example.community', ANN)).toBe(
      '@ann.example.community',
    );
    expect(rewriteMentions('@bob@example.community', BOB)).toBe(
      '@bob@example.community',
    );
    expect(rewriteMentions('x@bob@example.com', BOB)).toBe('x@bob@example.com');
    expect(
      rewriteMentions('see https://mastodon.social/@bob@example.com', BOB),
    ).toBe('see https://mastodon.social/@bob@example.com');
    expect(rewriteMentions('see https://site.com/@ann.example.com', ANN)).toBe(
      'see https://site.com/@ann.example.com',
    );
    expect(
      rewriteMentions('mail ann@ann.example.com, not @ann.example.com', ANN),
    ).toBe(`mail ann@ann.example.com, not @{${B},ann.example.com}`);
    expect(rewriteMentions('@{x,@ann.example.com}', ANN)).toBe(
      '@{x,@ann.example.com}',
    );
  });

  // Tripwire: with a string replacement, `String.prototype.replace` reads
  // `$&`, `$1`, `$$` etc. as patterns, so a name like `$&` would become the
  // matched `@<hex>`. This fails if someone switches back to naive regex-based
  // replace logic
  it('does not treat $ in a name as a replacement pattern', () => {
    expect(
      rewriteMentions(`@${A}`, { [A]: { identity: A, renderAs: '$&' } }),
    ).toBe(`@{${A},$&}`);
  });
});
