import { toDigestKey, type IFileStoreDriver, v2 } from '@polycentric/js-core';

/**
 * Origin Private File System backed IFileStoreDriver. Blob bytes are
 * written to one file per digest under a private subdirectory, named
 * `{type}_{hex(value)}` to match the CDN URL convention.
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

  private name(digest: v2.ContentDigest): string {
    return toDigestKey(digest);
  }

  async has(digest: v2.ContentDigest): Promise<boolean> {
    try {
      await this.directory.getFileHandle(this.name(digest));
      return true;
    } catch (err) {
      if ((err as DOMException).name === 'NotFoundError') return false;
      throw err;
    }
  }

  async get(digest: v2.ContentDigest): Promise<Uint8Array | null> {
    try {
      const handle = await this.directory.getFileHandle(this.name(digest));
      const file = await handle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch (err) {
      if ((err as DOMException).name === 'NotFoundError') return null;
      throw err;
    }
  }

  async put(digest: v2.ContentDigest, bytes: Uint8Array): Promise<void> {
    const handle = await this.directory.getFileHandle(this.name(digest), {
      create: true,
    });
    const writable = await handle.createWritable();
    try {
      // Blob bytes are never SharedArrayBuffer-backed, so narrow to the
      // ArrayBuffer-backed view that the writable stream requires.
      await writable.write(bytes as Uint8Array<ArrayBuffer>);
    } finally {
      await writable.close();
    }
  }

  async delete(digest: v2.ContentDigest): Promise<void> {
    try {
      await this.directory.removeEntry(this.name(digest));
    } catch (err) {
      if ((err as DOMException).name === 'NotFoundError') return;
      throw err;
    }
  }
}
