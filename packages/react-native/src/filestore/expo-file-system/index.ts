import { Directory, File, Paths } from 'expo-file-system';
import { segmentsFromPath, type IFileStoreDriver } from '@polycentric/js-core';

/**
 * expo-file-system-backed IFileStoreDriver.
   Paths are resolved under `${Paths.document}/${subdir}/`.
 */
export class ExpoFileStoreDriver implements IFileStoreDriver {
  private constructor(private readonly directory: Directory) {}

  static async create(subdir: string): Promise<ExpoFileStoreDriver> {
    const directory = new Directory(Paths.document, subdir);
    directory.create({ intermediates: true, idempotent: true });
    return new ExpoFileStoreDriver(directory);
  }

  private fileFor(path: string): File {
    return new File(this.directory, ...segmentsFromPath(path));
  }

  async has(path: string): Promise<boolean> {
    return this.fileFor(path).exists;
  }

  async get(path: string): Promise<Uint8Array | null> {
    const file = this.fileFor(path);
    if (!file.exists) return null;
    return file.bytes();
  }

  async put(path: string, bytes: Uint8Array): Promise<void> {
    const file = this.fileFor(path);
    file.parentDirectory.create({ intermediates: true, idempotent: true });
    file.write(bytes);
  }

  async delete(path: string): Promise<boolean> {
    const file = this.fileFor(path);
    if (!file.exists) return false;
    file.delete();
    return true;
  }
}

export async function createReactNativeFileStoreDriver(
  subdir: string,
): Promise<ExpoFileStoreDriver> {
  return ExpoFileStoreDriver.create(subdir);
}
