// render.ts pulls in the platform registry, whose logos need vector icons.
jest.mock('@expo/vector-icons', () => ({ FontAwesome6: () => null }));
jest.mock('@/src/common/theme', () => ({}));

import type { ClaimField } from '../hooks/useClaimById';
import { resolveClaimTitle } from './render';

const field = (key: string, value: string): ClaimField => ({
  key,
  label: key,
  value,
});

describe('resolveClaimTitle', () => {
  describe('Platform claims', () => {
    it('titles as "<account> on <platform>" using the display name', () => {
      const { title } = resolveClaimTitle('Platform', [
        field('platform', 'youtube'),
        field('account', '@futo-tech'),
      ]);
      expect(title).toBe('@futo-tech on YouTube');
    });

    it('falls back to the raw slug for unknown platforms', () => {
      const { title } = resolveClaimTitle('Platform', [
        field('platform', 'myspace'),
        field('account', 'tom'),
      ]);
      expect(title).toBe('tom on myspace');
    });

    it('titles as just the account without a platform field', () => {
      const { title } = resolveClaimTitle('Platform', [
        field('account', 'futo'),
      ]);
      expect(title).toBe('futo');
    });

    it('keeps the remaining fields in the body', () => {
      const { bodyFields } = resolveClaimTitle('Platform', [
        field('platform', 'youtube'),
        field('account', '@futo-tech'),
        field('account_id', 'UC123'),
        field('url', 'https://youtube.com/@futo-tech'),
      ]);
      expect(bodyFields.map((f) => f.key)).toEqual(['account_id', 'url']);
    });

    it('falls back to the schema name without an account field', () => {
      const result = resolveClaimTitle('Platform', [
        field('platform', 'youtube'),
      ]);
      expect(result.title).toBe('Platform');
      expect(result.bodyFields.map((f) => f.key)).toEqual(['platform']);
    });
  });

  describe('title-field claim types', () => {
    it('promotes the field to the title and drops it from the body', () => {
      const result = resolveClaimTitle('Freeform', [
        field('name', 'My claim'),
        field('description', 'Details'),
      ]);
      expect(result.title).toBe('My claim');
      expect(result.bodyFields.map((f) => f.key)).toEqual(['description']);
    });

    it('uses the skill field for Skill claims', () => {
      const { title } = resolveClaimTitle('Skill', [field('skill', 'Rust')]);
      expect(title).toBe('Rust');
    });

    it('falls back to the schema name when the field is empty', () => {
      const result = resolveClaimTitle('Freeform', [
        field('name', ''),
        field('description', 'Details'),
      ]);
      expect(result.title).toBe('Freeform');
      // An empty title field is still promoted out of the body.
      expect(result.bodyFields.map((f) => f.key)).toEqual(['description']);
    });
  });

  describe('other claim types', () => {
    it('uses the schema name and keeps all fields', () => {
      const fields = [
        field('job_title', 'Developer'),
        field('company', 'FUTO'),
      ];
      const result = resolveClaimTitle('Occupation', fields);
      expect(result.title).toBe('Occupation');
      expect(result.bodyFields).toEqual(fields);
    });

    it('handles an empty field list', () => {
      const result = resolveClaimTitle('Occupation', []);
      expect(result.title).toBe('Occupation');
      expect(result.bodyFields).toEqual([]);
    });
  });
});
