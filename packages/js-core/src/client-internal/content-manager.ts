import { sha256 } from '@noble/hashes/sha2';
import * as Proto from '../proto/v2';
import { PolycentricClient } from '../polycentric-client';

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
}
