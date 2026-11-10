import { assertIdentity, isIdentityKey } from '../data-store/guards';
import type { IFileStoreDriver, IStorageDriver } from '../platform-interfaces';
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

  /**
   * Ensure that we have migrated legacy blobs.
   * Skips the migration work if a previous v2 migration has completed.
   * Copies the legacy blobs without deleting them.
   *
   * TODO: more sophisticated migration logic once we have more than one.
   */
  async migrate({ storage }: FileStoreMigrationOptions): Promise<void> {
    // Path at which the marker is placed when the migration has completed.
    const MIGRATION_MARKER = 'migrations/v2';

    // File names written by the legacy store at the root: `{type}_{hex}`.
    const LEGACY_BLOB_NAME = /^\d+_(?:[0-9a-f]{2})+$/;

    if (await this.driver.has(MIGRATION_MARKER)) return;

    // Find active identity/owner
    const login = await storage.getActiveLogin();
    const identity = login?.identity;
    if (!identity || !isIdentityKey(identity)) {
      await this.driver.put(MIGRATION_MARKER, new Uint8Array());
      return;
    }

    // Find blobs to migrate
    const entries = (await this.driver.list('')) ?? [];
    const names = entries
      .filter((e) => e.kind === 'file' && LEGACY_BLOB_NAME.test(e.name))
      .map((e) => e.name);

    // Copy blobs
    for (const name of names) {
      const bytes = await this.driver.get(name);
      if (!bytes) continue;

      await this.driver.put(`blobs/${identity}/${name}`, bytes);
    }

    // Write completion marker
    await this.driver.put(MIGRATION_MARKER, new Uint8Array());
  }
}

export type FileStoreMigrationOptions = {
  /**
   * Required so that we can read what the active login is.
   */
  storage: IStorageDriver;
};

const invalidOwner = (message: string) =>
  new FileStoreError('invalid owner', message);
