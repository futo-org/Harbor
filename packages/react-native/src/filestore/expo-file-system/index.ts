import { Directory, File, Paths } from 'expo-file-system';
import {
  FileStoreError,
  isValidPathSegment,
  segmentsFromPath,
  type FileStoreEntry,
  type IFileStoreDriver,
} from '@polycentric/js-core';

/**
 * expo-file-system-backed IFileStoreDriver.
 * Paths are resolved under `${Paths.document}/${subdir}/`.
 */
export class ExpoFileStoreDriver implements IFileStoreDriver {
  private constructor(private readonly directory: Directory) {}

  static async create(subdir: string): Promise<ExpoFileStoreDriver> {
    try {
      const directory = new Directory(Paths.document, subdir);
      directory.create({ intermediates: true, idempotent: true });
      return new ExpoFileStoreDriver(directory);
    } catch (err) {
      throw toFileStoreError(err, subdir);
    }
  }

  private fileFor(path: string): File {
    return new File(this.directory, ...segmentsFromPath(path));
  }

  /**
   * Walk to the directory at `segments`.
   * Returns `null` if the directory does not exist.
   * Throws a `'path conflict'` error if it or a parent is a file.
   */
  private dirFor(path: string, segments: string[]): Directory | null {
    let dir = this.directory;
    for (const segment of segments) {
      dir = new Directory(dir, segment);

      const info = Paths.info(dir.uri);
      if (!info.exists) return null;
      if (!info.isDirectory) {
        throw new FileStoreError('path conflict', `not a directory: ${path}`);
      }
    }

    return dir;
  }

  async has(path: string): Promise<boolean> {
    try {
      return this.fileFor(path).exists;
    } catch (err) {
      throw toFileStoreError(err, path);
    }
  }

  async get(path: string): Promise<Uint8Array | null> {
    try {
      const file = this.fileFor(path);
      if (!file.exists) return null;
      return await file.bytes();
    } catch (err) {
      throw toFileStoreError(err, path);
    }
  }

  async put(path: string, bytes: Uint8Array): Promise<void> {
    try {
      const file = this.fileFor(path);
      file.parentDirectory.create({ intermediates: true, idempotent: true });
      file.write(bytes);
    } catch (err) {
      throw toFileStoreError(err, path);
    }
  }

  async delete(path: string): Promise<boolean> {
    // Ensure the path is valid and access the file.
    let file: File;
    try {
      file = this.fileFor(path);
      if (!file.exists) return false;
    } catch (err) {
      throw toFileStoreError(err, path);
    }

    // Attempt deletion and return result
    try {
      file.delete();
      return true;
    } catch (err) {
      // Removed by someone else between the check and the delete.
      if (!file.exists) return false;
      throw toFileStoreError(err, path);
    }
  }

  async list(path: string): Promise<FileStoreEntry[] | null> {
    try {
      const dir = this.dirFor(path, segmentsFromPath(path, true));
      if (!dir) return null;

      const entries: FileStoreEntry[] = [];
      for (const entry of dir.list()) {
        if (!isValidPathSegment(entry.name)) continue;
        if (entry instanceof Directory) {
          entries.push({ kind: 'dir', name: entry.name });
        } else if (entry instanceof File) {
          entries.push({ kind: 'file', name: entry.name });
        }
      }

      return entries;
    } catch (err) {
      throw toFileStoreError(err, path);
    }
  }

  async deleteSubpath(path: string): Promise<void> {
    // Ensure the path is valid and access the directory.
    let dir: Directory | null;
    try {
      dir = this.dirFor(path, segmentsFromPath(path));
      if (!dir) return;
    } catch (err) {
      throw toFileStoreError(err, path);
    }

    // Attempt deletion
    try {
      dir.delete();
    } catch (err) {
      // Removed by someone else between the check and the delete.
      if (!dir.exists) return;
      throw toFileStoreError(err, path);
    }
  }
}

export async function createReactNativeFileStoreDriver(
  subdir: string,
): Promise<ExpoFileStoreDriver> {
  return ExpoFileStoreDriver.create(subdir);
}

function toFileStoreError(err: unknown, path: string): FileStoreError {
  if (err instanceof FileStoreError) return err;

  const code = err instanceof RangeError ? 'too big' : 'io';
  return new FileStoreError(
    code,
    `file store error (${code}) at ${path}: ${err}`,
    { cause: err },
  );
}
