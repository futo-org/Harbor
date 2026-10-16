import { describe, expect, it } from 'vitest';
import {
  FileStoreError,
  type FileStoreErrorCode,
  MAX_PATH_BYTES,
  MAX_SEGMENT_BYTES,
  isValidPathSegment,
  segmentsFromPath,
} from './file-store-driver';

const codeOf = (fn: () => unknown): FileStoreErrorCode | undefined => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(FileStoreError);
    return (err as FileStoreError).code;
  }
  return undefined;
};

const DIGEST_KEY =
  '1_e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const VALID_SEGMENTS = [
  'a',
  'b-c',
  'd_e.f',
  '.hidden',
  '0123',
  'trailing.',
  DIGEST_KEY,
  'a'.repeat(MAX_SEGMENT_BYTES),
];

const INVALID_SEGMENTS: [string, string][] = [
  ['uppercase', 'A'],
  ['space', 'a b'],
  ['backslash', 'a\\b'],
  ['null byte', 'a\0b'],
  ['colon', 'a:b'],
  ['non-ascii', 'é'],
  ['dot', '.'],
  ['dot-dot', '..'],
  ['long', 'a'.repeat(MAX_SEGMENT_BYTES + 1)],
];

describe('segmentsFromPath', () => {
  it('splits valid paths', () => {
    expect(segmentsFromPath('a')).toEqual(['a']);
    expect(segmentsFromPath('a/b-c/d_e.f')).toEqual(['a', 'b-c', 'd_e.f']);
    expect(segmentsFromPath('.hidden/0123')).toEqual(['.hidden', '0123']);
    expect(segmentsFromPath('trailing.')).toEqual(['trailing.']);
  });

  it('drops empty segments', () => {
    expect(segmentsFromPath('/a//b/')).toEqual(['a', 'b']);
  });

  it('accepts digest keys', () => {
    expect(segmentsFromPath(DIGEST_KEY)).toEqual([DIGEST_KEY]);
  });

  it.each([
    ['empty', ''],
    ['only separators', '///'],
  ])('rejects %s path', (_, path) => {
    expect(codeOf(() => segmentsFromPath(path))).toBe('invalid path');
  });

  it.each(INVALID_SEGMENTS)('rejects %s segment', (_, segment) => {
    expect(codeOf(() => segmentsFromPath(`a/${segment}/b`))).toBe(
      'invalid path',
    );
  });

  it('allows empty paths when requested', () => {
    expect(segmentsFromPath('', true)).toEqual([]);
    expect(segmentsFromPath('///', true)).toEqual([]);
    expect(codeOf(() => segmentsFromPath('A', true))).toBe('invalid path');
  });

  it('enforces segment and path length limits', () => {
    expect(codeOf(() => segmentsFromPath('a'.repeat(MAX_SEGMENT_BYTES)))).toBe(
      undefined,
    );

    const filler = `${'a'.repeat(MAX_SEGMENT_BYTES - 1)}/`.repeat(
      Math.ceil(MAX_PATH_BYTES / MAX_SEGMENT_BYTES),
    );

    const atLimit = `${filler.slice(0, MAX_PATH_BYTES - 1)}b`;

    expect(atLimit.length).toBe(MAX_PATH_BYTES);
    expect(codeOf(() => segmentsFromPath(atLimit))).toBe(undefined);
    expect(codeOf(() => segmentsFromPath(`${atLimit}/c`))).toBe('invalid path');
  });
});

describe('isValidPathSegment', () => {
  it.each(VALID_SEGMENTS)('accepts %s', (segment) => {
    expect(isValidPathSegment(segment)).toBe(true);
  });

  it.each(INVALID_SEGMENTS)('rejects %s', (_, segment) => {
    expect(isValidPathSegment(segment)).toBe(false);
  });

  it.each([
    ['empty', ''],
    ['separator', 'a/b'],
  ])('rejects %s', (_, segment) => {
    expect(isValidPathSegment(segment)).toBe(false);
  });
});
