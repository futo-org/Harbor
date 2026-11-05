import { isIdentityKey } from './isIdentityKey';

describe('isIdentityKey', () => {
  it('accepts 64 hex chars in either case', () => {
    expect(isIdentityKey('0a2bCD'.padEnd(64, 'f'))).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['short hex', 'cafe'],
    ['65 hex chars', 'a'.repeat(65)],
    ['non-hex', 'x'.repeat(64)],
    ['an alias', 'user@domain.com'],
  ])('rejects %s', (_label, input) => {
    expect(isIdentityKey(input)).toBe(false);
  });
});
