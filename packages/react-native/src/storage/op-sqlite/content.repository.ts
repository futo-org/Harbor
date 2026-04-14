import type { IContentRepository } from '@polycentric/js-core';
import { v2 } from '@polycentric/js-core';
import type { Database } from './database';

export class ContentRepository implements IContentRepository {
  constructor(private readonly database: Database) {}

  async save(digest: v2.ContentDigest, content: v2.Content): Promise<void> {
    const digestBytes = v2.ContentDigest.toBinary(digest);
    const contentBytes = v2.Content.toBinary(content);

    this.database.run(
      `INSERT OR REPLACE INTO content (digest_bytes, content_bytes) VALUES (?, ?)`,
      [digestBytes, contentBytes]
    );
  }

  async get(digest: v2.ContentDigest): Promise<v2.Content | null> {
    const digestBytes = v2.ContentDigest.toBinary(digest);

    const rows = this.database.execute<{
      content_bytes: ArrayBuffer;
    }>(`SELECT content_bytes FROM content WHERE digest_bytes = ?`, [
      digestBytes,
    ]);

    if (rows.length === 0) return null;

    return v2.Content.fromBinary(new Uint8Array(rows[0]!.content_bytes));
  }

  async getAll(): Promise<{ digest: v2.ContentDigest; content: v2.Content }[]> {
    const rows = this.database.execute<{
      digest_bytes: ArrayBuffer;
      content_bytes: ArrayBuffer;
    }>(`SELECT digest_bytes, content_bytes FROM content`);

    return rows.map((row) => ({
      digest: v2.ContentDigest.fromBinary(new Uint8Array(row.digest_bytes)),
      content: v2.Content.fromBinary(new Uint8Array(row.content_bytes)),
    }));
  }
}
