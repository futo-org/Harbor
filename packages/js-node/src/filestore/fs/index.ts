import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { segmentsFromPath, type IFileStoreDriver } from '@polycentric/js-core';

/**
 * Node.js filesystem-backed IFileStoreDriver.
 */
export class NodeFileStoreDriver implements IFileStoreDriver {
  private constructor(private readonly directory: string) {}

  static async create(directory: string): Promise<NodeFileStoreDriver> {
    await fs.mkdir(directory, { recursive: true });
    return new NodeFileStoreDriver(directory);
  }

  private pathFor(p: string): string {
    return path.join(this.directory, ...segmentsFromPath(p));
  }

  async has(p: string): Promise<boolean> {
    try {
      await fs.access(this.pathFor(p));
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw err;
    }
  }

  async get(p: string): Promise<Uint8Array | null> {
    try {
      const buf = await fs.readFile(this.pathFor(p));
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async put(p: string, bytes: Uint8Array): Promise<void> {
    const final = this.pathFor(p);
    await fs.mkdir(path.dirname(final), { recursive: true });

    // TODO: don't leak on failure
    const tmp = `${final}.tmp.${crypto.randomBytes(8).toString('hex')}`;
    await fs.writeFile(tmp, bytes);

    await fs.rename(tmp, final);
  }

  async delete(p: string): Promise<boolean> {
    try {
      await fs.unlink(this.pathFor(p));
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw err;
    }
  }
}

export async function createNodeFileStoreDriver(
  directory: string,
): Promise<NodeFileStoreDriver> {
  return NodeFileStoreDriver.create(directory);
}
