import * as Proto from '../proto/v2';

/**
 * ContentRepository stores serialized content bytes keyed by their digest.
 */
export interface IContentRepository {
  /**
   * Store content bytes with their digest as the key.
   *
   * @param digest - The content digest (e.g. SHA-256 hash)
   * @param content - The content message
   */
  save(digest: Proto.ContentDigest, content: Proto.Content): Promise<void>;

  /**
   * Retrieve content bytes by digest.
   *
   * @param digest - The content digest to look up
   * @returns The content bytes, or null if not found
   */
  get(digest: Proto.ContentDigest): Promise<Proto.Content | null>;

  /**
   * Return every stored (digest, content) pair. Used to hydrate the
   * in-memory Rust content store at startup.
   */
  getAll(): Promise<{ digest: Proto.ContentDigest; content: Proto.Content }[]>;
}
