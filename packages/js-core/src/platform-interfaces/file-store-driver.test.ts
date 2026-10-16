import { describe, expect, it } from 'vitest';
import {
  FileStoreError,
  type FileStoreErrorCode,
  MAX_PATH_BYTES,
  MAX_SEGMENT_BYTES,
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
    const key =
      '1_e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    expect(segmentsFromPath(key)).toEqual([key]);
  });

  it.each([
    ['empty', ''],
    ['only separators', '///'],
    ['uppercase', 'A'],
    ['space', 'a b'],
    ['backslash', 'a\\b'],
    ['null byte', 'a\0b'],
    ['colon', 'a:b'],
    ['non-ascii', 'é'],
    ['dot segment', 'a/./b'],
    ['dot-dot segment', 'a/../b'],
    ['long segment', 'a'.repeat(MAX_SEGMENT_BYTES + 1)],
  ])('rejects %s', (_, path) => {
    expect(codeOf(() => segmentsFromPath(path))).toBe('invalid path');
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
