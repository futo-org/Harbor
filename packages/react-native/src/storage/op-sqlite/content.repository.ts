import type { IContentRepository } from '@polycentric/js-core';

/**
 * In-memory content repository for React Native.
 * TODO: persist to SQLite once the v2 schema migration is in place.
 */
export class ContentRepository implements IContentRepository {
  private store = new Map<string, Uint8Array>();

  private digestKey(digest: Uint8Array): string {
    return Array.from(digest)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async putContent(digest: Uint8Array, contentBytes: Uint8Array): Promise<void> {
    this.store.set(this.digestKey(digest), contentBytes);
  }

  async getContent(digest: Uint8Array): Promise<Uint8Array | null> {
    return this.store.get(this.digestKey(digest)) ?? null;
  }
}
