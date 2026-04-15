import type { IContentRepository } from '../platform-interfaces/content.repository';
import * as Proto from '../proto/v2';

export class ContentStore {
  constructor(private repository: IContentRepository) {}

  async save(
    digest: Proto.ContentDigest,
    content: Proto.Content,
  ): Promise<void> {
    await this.repository.save(digest, content);
  }

  async get(digest: Proto.ContentDigest): Promise<Proto.Content | null> {
    return this.repository.get(digest);
  }
}
