import { sql } from 'drizzle-orm';
import { v2 as Proto, type IContentRepository } from '@polycentric/js-core';
import type { SqliteDb } from '../database.js';

interface ContentRow {
  digest_bytes: Uint8Array;
  content_bytes: Uint8Array;
}

export class ContentRepository implements IContentRepository {
  constructor(private readonly db: SqliteDb) {}

  async save(
    digest: Proto.ContentDigest,
    contentMsg: Proto.Content,
  ): Promise<void> {
    const digestBytes = Proto.ContentDigest.toBinary(digest);
    const contentBytes = Proto.Content.toBinary(contentMsg);
    await this.db.run(sql`
      INSERT INTO content (digest_bytes, content_bytes)
      VALUES (${digestBytes}, ${contentBytes})
      ON CONFLICT(digest_bytes) DO UPDATE SET
        content_bytes = excluded.content_bytes
    `);
  }

  async get(digest: Proto.ContentDigest): Promise<Proto.Content | null> {
    const digestBytes = Proto.ContentDigest.toBinary(digest);
    const rows = await this.db.all<Pick<ContentRow, 'content_bytes'>>(sql`
      SELECT content_bytes FROM content
      WHERE digest_bytes = ${digestBytes}
      LIMIT 1
    `);
    if (rows.length === 0) return null;
    try {
      return Proto.Content.fromBinary(rows[0]!.content_bytes);
    } catch (error) {
      // A row that no longer decodes (corruption, wire-format change) is
      // treated as missing rather than failing the caller.
      console.warn('Skipping undecodable content row:', error);
      return null;
    }
  }

  async getAll(): Promise<
    { digest: Proto.ContentDigest; content: Proto.Content }[]
  > {
    const rows = await this.db.all<ContentRow>(sql`
      SELECT digest_bytes, content_bytes FROM content
    `);
    const results: { digest: Proto.ContentDigest; content: Proto.Content }[] =
      [];
    for (const r of rows) {
      try {
        results.push({
          digest: Proto.ContentDigest.fromBinary(r.digest_bytes),
          content: Proto.Content.fromBinary(r.content_bytes),
        });
      } catch (error) {
        // A row that no longer decodes (corruption, wire-format change)
        // must not prevent the rest of the store from loading.
        console.warn('Skipping undecodable content row:', error);
      }
    }
    return results;
  }
}
