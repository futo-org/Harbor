import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  toDigestKey,
  type IFileStoreDriver,
  type v2,
} from '@polycentric/js-core';

/**
 * Filesystem-backed IFileStoreDriver. Blob bytes are written to one
 * file per digest under `directory`, named `{type}_{hex(value)}` to
 * match the CDN URL convention.
 */
export class NodeFileStoreDriver implements IFileStoreDriver {
  private constructor(private readonly directory: string) {}

  static async create(directory: string): Promise<NodeFileStoreDriver> {
    await fs.mkdir(directory, { recursive: true });
    return new NodeFileStoreDriver(directory);
  }

  private pathFor(digest: v2.ContentDigest): string {
    return path.join(this.directory, toDigestKey(digest));
  }

  async has(digest: v2.ContentDigest): Promise<boolean> {
    try {
      await fs.access(this.pathFor(digest));
      return true;
    } catch {
      return false;
    }
  }

  async get(digest: v2.ContentDigest): Promise<Uint8Array | null> {
    try {
      const buf = await fs.readFile(this.pathFor(digest));
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async put(digest: v2.ContentDigest, bytes: Uint8Array): Promise<void> {
    const final = this.pathFor(digest);
    const tmp = `${final}.tmp.${crypto.randomBytes(8).toString('hex')}`;
    await fs.writeFile(tmp, bytes);
    await fs.rename(tmp, final);
  }

  async delete(digest: v2.ContentDigest): Promise<void> {
    try {
      await fs.unlink(this.pathFor(digest));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}

export async function createNodeFileStoreDriver(
  directory: string,
): Promise<NodeFileStoreDriver> {
  return NodeFileStoreDriver.create(directory);
}
