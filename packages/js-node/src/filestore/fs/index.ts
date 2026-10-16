import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  FileStoreError,
  isValidPathSegment,
  segmentsFromPath,
  type FileStoreEntry,
  type FileStoreErrorCode,
  type IFileStoreDriver,
} from '@polycentric/js-core';

/**
 * Node.js filesystem-backed IFileStoreDriver.
 */
export class NodeFileStoreDriver implements IFileStoreDriver {
  private constructor(private readonly directory: string) {}

  static async create(directory: string): Promise<NodeFileStoreDriver> {
    try {
      await fs.mkdir(directory, { recursive: true });
    } catch (err) {
      throw toFileStoreError(err, directory);
    }

    return new NodeFileStoreDriver(directory);
  }

  private pathFor(p: string, allowEmpty = false): string {
    return path.join(this.directory, ...segmentsFromPath(p, allowEmpty));
  }

  async has(p: string): Promise<boolean> {
    try {
      const stats = await fs.stat(this.pathFor(p));
      return stats.isFile();
    } catch (err) {
      if (getErrno(err) === 'ENOENT') return false;
      throw toFileStoreError(err, p);
    }
  }

  async get(p: string): Promise<Uint8Array | null> {
    try {
      const buf = await fs.readFile(this.pathFor(p));
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch (err) {
      if (getErrno(err) === 'ENOENT') return null;
      throw toFileStoreError(err, p);
    }
  }

  async put(p: string, bytes: Uint8Array): Promise<void> {
    try {
      const final = this.pathFor(p);
      await fs.mkdir(path.dirname(final), { recursive: true });
      await fs.writeFile(final, bytes);
    } catch (err) {
      throw toFileStoreError(err, p);
    }
  }

  async delete(p: string): Promise<boolean> {
    try {
      await fs.unlink(this.pathFor(p));
      return true;
    } catch (err) {
      if (getErrno(err) === 'ENOENT') return false;
      throw toFileStoreError(err, p);
    }
  }

  async list(p: string): Promise<FileStoreEntry[] | null> {
    try {
      const dirents = await fs.readdir(this.pathFor(p, true), {
        withFileTypes: true,
      });

      const entries: FileStoreEntry[] = [];
      for (const dirent of dirents) {
        if (!isValidPathSegment(dirent.name)) continue;
        if (dirent.isFile()) {
          entries.push({ kind: 'file', name: dirent.name });
        } else if (dirent.isDirectory()) {
          entries.push({ kind: 'dir', name: dirent.name });
        }
      }

      return entries;
    } catch (err) {
      if (getErrno(err) === 'ENOENT') return null;
      throw toFileStoreError(err, p);
    }
  }

  async deleteSubpath(p: string): Promise<void> {
    try {
      const target = this.pathFor(p);
      const stats = await fs.lstat(target);
      if (!stats.isDirectory()) {
        throw new FileStoreError('path conflict', `not a directory: ${p}`);
      }

      await fs.rm(target, { recursive: true, force: true });
    } catch (err) {
      if (getErrno(err) === 'ENOENT') return;
      throw toFileStoreError(err, p);
    }
  }
}

export async function createNodeFileStoreDriver(
  directory: string,
): Promise<NodeFileStoreDriver> {
  return NodeFileStoreDriver.create(directory);
}

const ERRNO_CODES = new Map<string, FileStoreErrorCode>([
  ['ENOTDIR', 'path conflict'],
  ['EISDIR', 'path conflict'],
  ['EEXIST', 'path conflict'],
  ['ENOTEMPTY', 'path conflict'],
  ['EACCES', 'permission'],
  ['EPERM', 'permission'],
  ['EROFS', 'permission'],
  ['EBUSY', 'busy'],
  ['EMFILE', 'busy'],
  ['ENFILE', 'busy'],
  ['ERR_FS_FILE_TOO_LARGE', 'too big'],
  ['EFBIG', 'too big'],
  ['ENOSPC', 'out of space'],
  ['EDQUOT', 'out of space'],
  ['ENAMETOOLONG', 'invalid path'],
  ['ERR_INVALID_ARG_VALUE', 'invalid path'],
]);

function getErrno(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | undefined)?.code;
}

function toFileStoreError(err: unknown, p: string): FileStoreError {
  if (err instanceof FileStoreError) return err;

  const errno = getErrno(err);
  const errnoCode = errno ? ERRNO_CODES.get(errno) : undefined;

  let code: FileStoreErrorCode;
  if (errnoCode !== undefined) {
    code = errnoCode;
  } else if (err instanceof RangeError) {
    code = 'too big';
  } else {
    code = 'io';
  }

  return new FileStoreError(
    code,
    `file store error (${code}) at ${p}: ${err}`,
    { cause: err },
  );
}
