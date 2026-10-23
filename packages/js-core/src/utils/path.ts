import {
  FileStoreError,
  MAX_PATH_BYTES,
  MAX_SEGMENT_BYTES,
} from '../platform-interfaces/file-store-driver';

const SEGMENT_PATTERN = /^[a-z0-9_.-]+$/;

/**
 * Validate a path and split it into segments.
 * Throws an `'invalid path'` error for paths that don't pass the validation.
 */
export function segmentsFromPath(
  path: string,
  allowEmpty: boolean = false,
): string[] {
  const segments = path.split('/').filter((s) => s);

  if (segments.length === 0 && !allowEmpty) {
    throw invalidPath(path, 'empty');
  }

  for (const segment of segments) {
    const reason = segmentError(segment);
    if (reason) throw invalidPath(path, reason);
  }
  if (segments.join('/').length > MAX_PATH_BYTES) {
    throw invalidPath(path, 'path is too long');
  }

  return segments;
}

export function isValidPathSegment(segment: string): boolean {
  return segmentError(segment) === null;
}

function segmentError(segment: string): string | null {
  if (!SEGMENT_PATTERN.test(segment)) {
    return 'segments may only contain [a-z0-9_.-]';
  } else if (segment === '.' || segment === '..') {
    return "contains '.' or '..'";
  } else if (segment.length > MAX_SEGMENT_BYTES) {
    return 'contains a segment that is too long';
  }
  return null;
}

function invalidPath(path: string, reason: string): FileStoreError {
  return new FileStoreError(
    'invalid path',
    `file store error (invalid path) at ${path}: ${reason}`,
  );
}
