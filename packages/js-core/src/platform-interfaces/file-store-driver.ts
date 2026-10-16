/**
 * Thin wrapper over a client platform's file system.
 * Exposes a limited subset of file system operations so that we can do what we
 * need without worrying too much about platform file system details.
 *
 * Path characters are restricted to lowercase letters, numbers, `.`, `-`,
 * and `_`.
 * `.` and `..` are banned as segment names.
 * There are length limits on each segment of the path and the full path.

 * File store drivers are intended for immutable content.
 * Concurrent use can result in data corruption or unexpected errors otherwise.
 * Mutable data should be managed by a database or something else with
 * stronger transactional guarantees.

 * File store drivers should restrict their errors to instances of `FileStoreError`.
 * Assume all functions can throw unless specified otherwise.
 */
export interface IFileStoreDriver {
  /**
   * Returns true if we find a file at `path`.
   */
  has(path: string): Promise<boolean>;

  /**
   * Return a caller-owned buffer with the contents of the file at `path` or
   * `null` if the file does not exist.
   */
  get(path: string): Promise<Uint8Array | null>;

  /**
   * Create a file at `path` and write `bytes` to it.
   * Parents directories are created automatically.
   * Keep in mind that this operation may not be atomic.
   */
  put(path: string, bytes: Uint8Array): Promise<void>;

  /**
   * Try to delete the file at `path` and returns true if a deletion was
   * performed.
   */
  delete(path: string): Promise<boolean>;

  /** List the files and directories at `path`. */
  list(path: string): Promise<FileStoreEntry[] | null>;

  /**
   * Delete all files and directories under this subpath.
   * For safety reasons, an empty path is not accepted here.
   */
  deleteSubpath(path: string): Promise<void>;
}

export type FileStoreEntry = {
  kind: 'file' | 'dir';
  name: string;
};

/**
 * File store drivers should use these error codes.
 * Implementations may fall back to `'io'` even when a more specific error code
 * is applicable.
 */
export type FileStoreErrorCode =
  /** Path does not pass the validation below. */
  | 'invalid path'
  /** A file was encountered when a directory was expected, or vice versa. */
  | 'path conflict'
  /** The platform reported a permission error while accessing a file or directory. */
  | 'permission'
  /** A file or directory that we need to access is temporarily inaccessible. */
  | 'busy'
  /** The file contents are too big to store on this file system. */
  | 'too big'
  /** The file system does not have enough free space to store the file contents. */
  | 'out of space'
  /** Generic filesystem IO error. */
  | 'io';

export class FileStoreError extends Error {
  override readonly name = 'FileStoreError';

  constructor(
    readonly code: FileStoreErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export const MAX_SEGMENT_BYTES = 128;
export const MAX_PATH_BYTES = 1024;

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

/** Returns true if `segment` is a valid single path segment. */
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
