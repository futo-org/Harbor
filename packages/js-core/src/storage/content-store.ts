import type { IContentRepository } from '../platform-interfaces/content-repository';

export class ContentStore {
  constructor(private repository: IContentRepository) {}

  async putContent(digest: Uint8Array, contentBytes: Uint8Array): Promise<void> {
    await this.repository.putContent(digest, contentBytes);
  }

  async getContent(digest: Uint8Array): Promise<Uint8Array | null> {
    return this.repository.getContent(digest);
  }
}
