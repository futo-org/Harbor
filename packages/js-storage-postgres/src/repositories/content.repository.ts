import { sql } from 'drizzle-orm';
import { v2 as Proto, type IContentRepository } from '@polycentric/js-core';
import { all, type PgDb } from '../database.js';

interface ContentRow {
  digest_bytes: Uint8Array;
  content_bytes: Uint8Array;
}

const bytes = (value: Uint8Array): Buffer => Buffer.from(value);

export class ContentRepository implements IContentRepository {
  constructor(private readonly db: PgDb) {}

  async save(
    digest: Proto.ContentDigest,
    contentMsg: Proto.Content,
  ): Promise<void> {
    const digestBytes = Proto.ContentDigest.toBinary(digest);
    const contentBytes = Proto.Content.toBinary(contentMsg);
    await this.db.execute(sql`
      INSERT INTO content (digest_bytes, content_bytes)
      VALUES (${bytes(digestBytes)}, ${bytes(contentBytes)})
      ON CONFLICT (digest_bytes) DO UPDATE SET
        content_bytes = EXCLUDED.content_bytes
    `);
  }

  async get(digest: Proto.ContentDigest): Promise<Proto.Content | null> {
    const digestBytes = Proto.ContentDigest.toBinary(digest);
    const rows = await all<Pick<ContentRow, 'content_bytes'>>(
      this.db,
      sql`
        SELECT content_bytes FROM content
        WHERE digest_bytes = ${bytes(digestBytes)}
        LIMIT 1
      `,
    );
    const row = rows[0];
    if (!row) return null;
    return Proto.Content.fromBinary(row.content_bytes);
  }

  async getAll(): Promise<
    { digest: Proto.ContentDigest; content: Proto.Content }[]
  > {
    const rows = await all<ContentRow>(
      this.db,
      sql`SELECT digest_bytes, content_bytes FROM content`,
    );
    return rows.map((r) => ({
      digest: Proto.ContentDigest.fromBinary(r.digest_bytes),
      content: Proto.Content.fromBinary(r.content_bytes),
    }));
  }
}
