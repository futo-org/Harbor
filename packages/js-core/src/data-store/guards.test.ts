import { describe, expect, it } from 'vitest';
import { assertIdentity } from './guards';

class TestError extends Error {}

const toError = (message: string) => new TestError(message);

describe('assertIdentity', () => {
  it('accepts a 32 byte lowercase hex string', () => {
    expect(() => assertIdentity('0a'.repeat(32), toError)).not.toThrow();
  });

  it.each([
    ['empty', ''],
    ['too short', 'a'.repeat(63)],
    ['too long', 'a'.repeat(65)],
    ['uppercase', 'A'.repeat(64)],
    ['non-hex', 'g'.repeat(64)],
    ['surrounding whitespace', ` ${'a'.repeat(64)}`],
  ])('rejects %s identities with the given error', (_, identity) => {
    expect(() => assertIdentity(identity, toError)).toThrow(TestError);
  });
});
