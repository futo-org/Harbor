import { segmentsFromPath, type IFileStoreDriver } from '@polycentric/js-core';

/**
 * Origin Private File System backed IFileStoreDriver.
 */
export class OpfsFileStoreDriver implements IFileStoreDriver {
  private constructor(private readonly directory: FileSystemDirectoryHandle) {}

  static async create(directoryName: string): Promise<OpfsFileStoreDriver> {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle(directoryName, {
      create: true,
    });

    return new OpfsFileStoreDriver(directory);
  }

  /**
   * Walk to the directory containing `path`.
   * Creates parent directories when `create` is true.
   * Throws `NotFoundError` if a directory is missing and `create` is unset.
   */
  private async resolve(
    path: string,
    create: boolean,
  ): Promise<{ dir: FileSystemDirectoryHandle; name: string }> {
    const segments = segmentsFromPath(path);

    const name = segments.pop();
    if (!name) throw new Error('Empty path');

    let dir = this.directory;
    for (const segment of segments) {
      dir = await dir.getDirectoryHandle(segment, { create });
    }

    return { dir, name };
  }

  async has(path: string): Promise<boolean> {
    try {
      const { dir, name } = await this.resolve(path, false);
      await dir.getFileHandle(name);
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
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
      throw err;
    }
  }

  async put(path: string, bytes: Uint8Array): Promise<void> {
    const { dir, name } = await this.resolve(path, true);
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();

    try {
      await writable.write(asBufferSource(bytes));
    } finally {
      await writable.close();
    }
  }

  async delete(path: string): Promise<boolean> {
    try {
      const { dir, name } = await this.resolve(path, false);
      await dir.removeEntry(name);
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }
}

function isNotFound(err: unknown): boolean {
  return (err as DOMException).name === 'NotFoundError';
}

function asBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const { buffer } = bytes;
  if (buffer instanceof ArrayBuffer) {
    return new Uint8Array(buffer, bytes.byteOffset, bytes.byteLength);
  } else {
    return new Uint8Array(bytes);
  }
}
