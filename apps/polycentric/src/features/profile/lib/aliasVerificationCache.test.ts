// Mock the native package so importing the cache doesn't drag in uniffi/native
// init (which can't load under jest). We only need normalizeAlias; a
// faithful stand-in suffices here, as its real behaviour is covered by the
// js-core alias tests.
jest.mock('@polycentric/react-native', () => ({
  normalizeAlias: (alias: string): string | null => {
    let s = alias.trim();
    if (s.startsWith('@')) s = s.slice(1);
    const at = s.indexOf('@');
    if (at <= 0 || s.indexOf('@', at + 1) !== -1) return null;
    return s.toLowerCase();
  },
}));

// The cache keeps module-level state, so reload a fresh copy per test for
// isolation rather than relying on a reset hook.
type CacheModule = typeof import('./aliasVerificationCache');

const ID_A = '0a2abecb223dbd572729018f8d201f32471e2a5b71e2032c052f6830846c4722';
const ID_B = 'f00df0262908a197391c4cbc619eb11cb6867c90915b6e23a3db7a061def8fc3';

describe('aliasVerificationCache', () => {
  let cache: CacheModule;

  beforeEach(() => {
    jest.resetModules();
    cache = require('./aliasVerificationCache');
  });

  it('records a pair and reads it back in both directions', () => {
    cache.recordVerifiedAlias('user@domain.com', ID_A);
    expect(cache.getVerifiedIdentity('user@domain.com')).toBe(ID_A);
    expect(cache.getVerifiedAlias(ID_A)).toBe('user@domain.com');
  });

  it('returns null for aliases/identities that were never recorded', () => {
    expect(cache.getVerifiedIdentity('unknown@domain.com')).toBeNull();
    expect(cache.getVerifiedAlias(ID_B)).toBeNull();
  });

  it('looks up aliases regardless of leading @ or case', () => {
    cache.recordVerifiedAlias('User@Domain.com', ID_A);
    expect(cache.getVerifiedIdentity('user@domain.com')).toBe(ID_A);
    expect(cache.getVerifiedIdentity('@USER@DOMAIN.COM')).toBe(ID_A);
  });

  it('stores the alias in canonical (normalised) form', () => {
    cache.recordVerifiedAlias('@User@Domain.com', ID_A);
    expect(cache.getVerifiedAlias(ID_A)).toBe('user@domain.com');
  });

  it('looks up identities case-insensitively', () => {
    cache.recordVerifiedAlias('user@domain.com', 'AABBCCDD');
    expect(cache.getVerifiedAlias('aabbccdd')).toBe('user@domain.com');
    expect(cache.getVerifiedAlias('AABBCCDD')).toBe('user@domain.com');
  });

  it('ignores a malformed alias', () => {
    cache.recordVerifiedAlias('not-an-alias', ID_A);
    expect(cache.getVerifiedAlias(ID_A)).toBeNull();
    expect(cache.getVerifiedIdentity('not-an-alias')).toBeNull();
  });

  it('keeps distinct pairs independent', () => {
    cache.recordVerifiedAlias('alice@domain.com', ID_A);
    cache.recordVerifiedAlias('bob@domain.com', ID_B);
    expect(cache.getVerifiedIdentity('alice@domain.com')).toBe(ID_A);
    expect(cache.getVerifiedIdentity('bob@domain.com')).toBe(ID_B);
    expect(cache.getVerifiedAlias(ID_A)).toBe('alice@domain.com');
    expect(cache.getVerifiedAlias(ID_B)).toBe('bob@domain.com');
  });
});
