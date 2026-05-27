import { sha256 } from '@noble/hashes/sha2';
import { PolycentricClient } from '../polycentric-client';
import * as Proto from '../proto/v2';

export class ContentManager {
  constructor(private readonly client: PolycentricClient) {}

  /**
   * Helper function to build content
   */
  build(contentBody: Proto.Content['contentBody']): Proto.Content {
    return Proto.Content.create({ contentBody });
  }

  /**
   * Builds ContentDigest from a provided Content
   */
  buildDigest(content: Proto.Content) {
    const contentBytes = Proto.Content.toBinary(content);

    return Proto.ContentDigest.create({
      type: Proto.ContentDigestType.SHA256,
      value: sha256(contentBytes),
    });
  }

  /**
   * Saves the content to the local client store
   */
  async save(content: Proto.Content): Promise<void> {
    const digest = this.buildDigest(content);
    await this.client.storage.content.save(digest, content);
  }

  /**
   * Download any blobs that we don't have locally from this content.
   * This is used so that blobs of an identity will eventually
   * persist on other devices in that identity.
   */
  async pullBlobs(content: Proto.Content): Promise<void> {
    const digests = this.collectBlobDigests(content);
    if (digests.length === 0) return;

    await Promise.all(
      digests.map(async (digest) => {
        try {
          if (await this.client.filestoreDriver.has(digest)) return;
          const bytes = await this.client.fetchBlobBytes(digest);
          if (!bytes) return;
          await this.client.filestoreDriver.put(digest, bytes);
        } catch (err) {
          console.warn('pullBlobs failed:', err);
        }
      }),
    );
  }

  /**
   * Collect all blob digests referenced in a post or profile update
   */
  private collectBlobDigests(content: Proto.Content): Proto.ContentDigest[] {
    const out: Proto.ContentDigest[] = [];
    const pushSet = (set?: Proto.ImageSet) => {
      if (!set) return;
      for (const img of set.images) {
        if (img.blob?.digest) out.push(img.blob.digest);
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
