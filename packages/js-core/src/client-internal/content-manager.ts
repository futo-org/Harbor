import { sha256 } from '@noble/hashes/sha2.js';
import type { PolycentricClient } from '../polycentric-client';
import * as Proto from '../proto/v2';

/**
 * Content and blob helpers for `PolycentricClient` (`client.contentManager`).
 */
export class ContentManager {
  constructor(private readonly client: PolycentricClient) {}

  /** Wrap a content body in a `Content` message. */
  build(contentBody: Proto.Content['contentBody']): Proto.Content {
    return Proto.Content.create({ contentBody });
  }

  /** SHA-256 `ContentDigest` of serialized content bytes. */
  buildDigest(contentBytes: Uint8Array) {
    return Proto.ContentDigest.create({
      type: Proto.ContentDigestType.SHA256,
      value: sha256(contentBytes),
    });
  }

  /**
   * Download any blobs in the array that we don't have locally.
   * This is used so that blobs of an identity will eventually
   * persist on other devices in that identity.
   * Failures are logged per blob and never thrown.
   */
  async pullBlobs(identity: string, blobs: Proto.Blob[]): Promise<void> {
    const digests = blobs.map((b) => b.digest).filter((d) => !!d);

    if (digests.length === 0) return;

    await Promise.allSettled(
      digests.map(async (digest) => {
        try {
          if (await this.client.fileStore.has(identity, digest)) return;
          const bytes = await this.client.fetchBlobBytes(digest);
          if (!bytes) return;
          await this.client.fileStore.put(identity, digest, bytes);
        } catch (err) {
          console.warn('pullBlobs failed:', err);
        }
      }),
    );
  }

  /**
   * Collect all blobs referenced in a post (image sets) or profile update
   * (avatar and banner). Other content types yield an empty array.
   */
  static collectBlobs(content: Proto.Content): Proto.Blob[] {
    const out: Proto.Blob[] = [];
    const pushSet = (set?: Proto.ImageSet) => {
      if (!set) return;
      for (const img of set.images) {
        if (img.blob) out.push(img.blob);
      }
    };
    const body = content.contentBody;
    if (body.oneofKind === 'post') {
      for (const set of body.post.images) pushSet(set);
    } else if (body.oneofKind === 'profileUpdate') {
      pushSet(body.profileUpdate.avatar);
      pushSet(body.profileUpdate.banner);
    }
    return out;
  }
}
