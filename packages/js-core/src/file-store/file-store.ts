import type { IFileStoreDriver } from '../platform-interfaces';
import type * as Proto from '../proto/v2';
import { toDigestKey } from '../utils/hex';

/**
 * Manage blobs that have been persisted locally by the client.
 */
export class FileStore {
  constructor(private driver: IFileStoreDriver) {}

  private pathFor(digest: Proto.ContentDigest): string {
    return toDigestKey(digest);
  }

  has(digest: Proto.ContentDigest): Promise<boolean> {
    return this.driver.has(this.pathFor(digest));
  }

  get(digest: Proto.ContentDigest): Promise<Uint8Array | null> {
    return this.driver.get(this.pathFor(digest));
  }

  put(digest: Proto.ContentDigest, bytes: Uint8Array): Promise<void> {
    return this.driver.put(this.pathFor(digest), bytes);
  }

  delete(digest: Proto.ContentDigest): Promise<boolean> {
    return this.driver.delete(this.pathFor(digest));
  }
}
