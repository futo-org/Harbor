import { Directory, File, Paths } from 'expo-file-system';
import {
  toDigestKey,
  type IFileStoreDriver,
  type v2,
} from '@polycentric/js-core';

/**
 * expo-file-system-backed IFileStoreDriver. Blob bytes are written to
 * one file per digest under `${Paths.document}/${subdir}/`, named
 * `{type}_{hex(value)}` to match the CDN URL convention.
 */
export class ExpoFileStoreDriver implements IFileStoreDriver {
  private constructor(private readonly directory: Directory) {}

  static async create(subdir: string): Promise<ExpoFileStoreDriver> {
    const directory = new Directory(Paths.document, subdir);
    directory.create({ intermediates: true, idempotent: true });
    return new ExpoFileStoreDriver(directory);
  }

  private fileFor(digest: v2.ContentDigest): File {
    return new File(this.directory, toDigestKey(digest));
  }

  async has(digest: v2.ContentDigest): Promise<boolean> {
    return this.fileFor(digest).exists;
  }

  async get(digest: v2.ContentDigest): Promise<Uint8Array | null> {
    const file = this.fileFor(digest);
    if (!file.exists) return null;
    return file.bytes();
  }

  async put(digest: v2.ContentDigest, bytes: Uint8Array): Promise<void> {
    this.fileFor(digest).write(bytes);
  }

  async delete(digest: v2.ContentDigest): Promise<void> {
    const file = this.fileFor(digest);
    if (file.exists) file.delete();
  }
}

export async function createReactNativeFileStoreDriver(
  subdir: string,
): Promise<ExpoFileStoreDriver> {
  return ExpoFileStoreDriver.create(subdir);
}
