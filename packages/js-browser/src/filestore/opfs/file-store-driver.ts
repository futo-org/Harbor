import {
  FileStoreError,
  isValidPathSegment,
  segmentsFromPath,
  type FileStoreEntry,
  type FileStoreErrorCode,
  type IFileStoreDriver,
} from '@polycentric/js-core';

/**
 * Origin Private File System backed IFileStoreDriver.
 */
export class OpfsFileStoreDriver implements IFileStoreDriver {
  private constructor(private readonly directory: FileSystemDirectoryHandle) {}

  static async create(directoryName: string): Promise<OpfsFileStoreDriver> {
    try {
      const root = await navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle(directoryName, {
        create: true,
      });

      return new OpfsFileStoreDriver(directory);
    } catch (err) {
      throw toFileStoreError(err, directoryName);
    }
  }

  /**
   * Walk to the directory containing `path`.
   * Creates parent directories when `create` is true.
   * May throw errors that need wrapping on failure.
   */
  private async resolve(
    path: string,
    create: boolean,
  ): Promise<{ dir: FileSystemDirectoryHandle; name: string }> {
    const segments = segmentsFromPath(path);

    const name = segments.pop();
    if (!name) throw new FileStoreError('invalid path', 'path has no segments');

    return { dir: await this.resolveDir(segments, create), name };
  }

  /**
   * Walk to the directory at `segments`.
   * Creates missing directories when `create` is true.
   * May throw errors that need wrapping on failure.
   */
  private async resolveDir(
    segments: string[],
    create: boolean,
  ): Promise<FileSystemDirectoryHandle> {
    let dir = this.directory;
    for (const segment of segments) {
      dir = await dir.getDirectoryHandle(segment, { create });
    }

    return dir;
  }

  async has(path: string): Promise<boolean> {
    try {
      const { dir, name } = await this.resolve(path, false);
      await dir.getFileHandle(name);
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw toFileStoreError(err, path);
    }
  }

  async get(path: string): Promise<Uint8Array | null> {
    try {
      const { dir, name } = await this.resolve(path, false);
      const handle = await dir.getFileHandle(name);
      const file = await handle.getFile();

      return new Uint8Array(await file.arrayBuffer());
    } catch (err) {
      if (isNotFound(err)) return null;
      throw toFileStoreError(err, path);
    }
  }

  async put(path: string, bytes: Uint8Array): Promise<void> {
    try {
      const { dir, name } = await this.resolve(path, true);
      const handle = await dir.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();

      // Write the file and close on success or abort on error
      try {
        await writable.write(asBufferSource(bytes));
        await writable.close();
      } catch (err) {
        await writable.abort().catch(() => {});
        throw err;
      }
    } catch (err) {
      throw toFileStoreError(err, path);
    }
  }

  async delete(path: string): Promise<boolean> {
    try {
      const { dir, name } = await this.resolve(path, false);
      // Access the file first so that we return better information to callers.
      // We discover if the path is not a file or does not exist.
      await dir.getFileHandle(name);
      await dir.removeEntry(name);
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw toFileStoreError(err, path);
    }
  }

  async list(path: string): Promise<FileStoreEntry[] | null> {
    try {
      const dir = await this.resolveDir(segmentsFromPath(path, true), false);

      const entries: FileStoreEntry[] = [];
      for await (const [name, handle] of dir.entries()) {
        if (!isValidPathSegment(name)) continue;
        entries.push({ kind: handle.kind === 'file' ? 'file' : 'dir', name });
      }

      return entries;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw toFileStoreError(err, path);
    }
  }

  async deleteSubpath(path: string): Promise<void> {
    try {
      const { dir, name } = await this.resolve(path, false);
      // Access the directory first to discover if the path is not a directory
      // or does not exist.
      await dir.getDirectoryHandle(name);
      await dir.removeEntry(name, { recursive: true });
    } catch (err) {
      if (isNotFound(err)) return;
      throw toFileStoreError(err, path);
    }
  }
}

const DOM_EXCEPTION_CODES = new Map<string, FileStoreErrorCode>([
  ['TypeMismatchError', 'path conflict'],
  ['InvalidModificationError', 'path conflict'],
  ['SecurityError', 'permission'],
  ['NotAllowedError', 'permission'],
  ['NoModificationAllowedError', 'busy'],
  ['QuotaExceededError', 'out of space'],
]);

function isNotFound(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'NotFoundError';
}

function toFileStoreError(err: unknown, path: string): FileStoreError {
  if (err instanceof FileStoreError) return err;

  let code: FileStoreErrorCode = 'io';
  if (err instanceof DOMException) {
    code = DOM_EXCEPTION_CODES.get(err.name) ?? 'io';
  } else if (err instanceof RangeError) {
    code = 'too big';
  }

  return new FileStoreError(
    code,
    `file store error (${code}) at ${path}: ${err}`,
    { cause: err },
  );
}

/** Copy the buffer when needed or else reuse it. */
function asBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const { buffer } = bytes;
  if (buffer instanceof ArrayBuffer) {
    return new Uint8Array(buffer, bytes.byteOffset, bytes.byteLength);
  } else {
    return new Uint8Array(bytes);
  }
}
