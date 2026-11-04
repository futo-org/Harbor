import { describe, expect, it } from 'vitest';
import { normalizeAlias } from './alias-resolver';

describe('normalizeAlias', () => {
  it('canonicalises a plain alias', () => {
    expect(normalizeAlias('user@domain.com')).toBe('user@domain.com');
  });

  it('strips a single leading @', () => {
    expect(normalizeAlias('@user@domain.com')).toBe('user@domain.com');
  });

  it('lowercases local part and domain', () => {
    expect(normalizeAlias('User@Domain.COM')).toBe('user@domain.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeAlias('  user@domain.com  ')).toBe('user@domain.com');
  });

  it('accepts dotted local parts and multi-label domains', () => {
    expect(normalizeAlias('user.name@sub.domain.com')).toBe(
      'user.name@sub.domain.com',
    );
  });

  it('accepts a bare domain (wildcard alias)', () => {
    expect(normalizeAlias('Domain.COM')).toBe('domain.com');
    expect(normalizeAlias('@domain.com')).toBe('domain.com');
    expect(normalizeAlias('  domain.com  ')).toBe('domain.com');
    expect(normalizeAlias('sub.domain.com')).toBe('sub.domain.com');
  });

  it.each([
    ['empty', ''],
    ['lone @', '@'],
    ['single-label bare domain', 'nodomain'],
    ['empty label in bare domain', 'domain..com'],
    ['trailing dot in bare domain', 'domain.com.'],
    ['bare domain with path', 'domain.com/path'],
    ['literal wildcard local part', '*@domain.com'],
    ['multiple @', 'a@@b.com'],
    ['single-label domain', 'user@localhost'],
    ['underscore in domain label', 'user@dom_ain.com'],
    ['hyphen-leading domain label', 'user@-domain.com'],
    ['space in local part', 'us er@domain.com'],
    ['disallowed local char (+)', 'user+tag@domain.com'],
  ])('rejects %s -> null', (_label, input) => {
    expect(normalizeAlias(input)).toBeNull();
  });
});
