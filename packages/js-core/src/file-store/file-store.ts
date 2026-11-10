import { assertIdentity } from '../data-store/guards';
import type { IFileStoreDriver } from '../platform-interfaces';
import { FileStoreError } from '../platform-interfaces/file-store-driver';
import type * as Proto from '../proto/v2';
import { toDigestKey } from '../utils/hex';

/**
 * Manage blobs that have been persisted locally by the client.
 */
export class FileStore {
  constructor(private driver: IFileStoreDriver) {}

  private pathFor(owner: string, digest: Proto.ContentDigest) {
    assertIdentity(owner, invalidOwner);
    return `blobs/${owner}/${toDigestKey(digest)}`;
  }

  /**
   * Returns true if we find a file for the requested digest at the legacy path
   * or under the owner.
   */
  async has(owner: string, digest: Proto.ContentDigest): Promise<boolean> {
    const path = this.pathFor(owner, digest);
    if (await this.hasLegacy(digest)) return true;
    return this.driver.has(path);
  }

  /**
   * Returns the contents of the file found at the legacy path for the requested
   * digest or the file for this digest under the owner if either is found.
   */
  async get(
    owner: string,
    digest: Proto.ContentDigest,
  ): Promise<Uint8Array | null> {
    const path = this.pathFor(owner, digest);

    const legacy = await this.getLegacy(digest);
    if (legacy) return legacy;

    return this.driver.get(path);
  }

  /**
   * Persist the digest->bytes mapping under the specified owner.
   * Legacy paths are not affected.
   */
  async put(
    owner: string,
    digest: Proto.ContentDigest,
    bytes: Uint8Array,
  ): Promise<void> {
    await this.driver.put(this.pathFor(owner, digest), bytes);
  }

  /**
   * Delete the file for the requested digest under the owner.
   * Does not delete any legacy files.
   */
  async delete(owner: string, digest: Proto.ContentDigest): Promise<boolean> {
    return this.driver.delete(this.pathFor(owner, digest));
  }

  // ---- Legacy blobs ----

  private legacyPathFor(digest: Proto.ContentDigest): string {
    return toDigestKey(digest);
  }

  private hasLegacy(digest: Proto.ContentDigest): Promise<boolean> {
    return this.driver.has(this.legacyPathFor(digest));
  }

  private getLegacy(digest: Proto.ContentDigest): Promise<Uint8Array | null> {
    return this.driver.get(this.legacyPathFor(digest));
  }

  deleteLegacy(digest: Proto.ContentDigest): Promise<boolean> {
    return this.driver.delete(this.legacyPathFor(digest));
  }
}

const invalidOwner = (message: string) =>
  new FileStoreError('invalid owner', message);
