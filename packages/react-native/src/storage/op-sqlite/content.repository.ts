import type { IContentRepository } from '@polycentric/js-core';
import { v2 } from '@polycentric/js-core';

/**
 * In-memory content repository for React Native.
 * TODO: persist to SQLite once the v2 schema migration is in place.
 */
interface StoredContent {
  digest: v2.ContentDigest;
  content: v2.Content;
}

export class ContentRepository implements IContentRepository {
  private store = new Map<string, StoredContent>();

  private digestKey(digest: v2.ContentDigest): string {
    return Array.from(v2.ContentDigest.toBinary(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async save(digest: v2.ContentDigest, content: v2.Content): Promise<void> {
    this.store.set(this.digestKey(digest), { digest, content });
  }

  async get(digest: v2.ContentDigest): Promise<v2.Content | null> {
    return this.store.get(this.digestKey(digest))?.content ?? null;
  }

  async getAll(): Promise<{ digest: v2.ContentDigest; content: v2.Content }[]> {
    return [...this.store.values()];
  }
}
