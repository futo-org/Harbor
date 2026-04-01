/**
 * ContentRepository stores serialized content bytes keyed by their digest.
 */
export interface IContentRepository {
  /**
   * Store content bytes with their digest as the key.
   *
   * @param digest - The content digest (e.g. SHA-256 hash)
   * @param contentBytes - The serialized content
   */
  putContent(digest: Uint8Array, contentBytes: Uint8Array): Promise<void>;

  /**
   * Retrieve content bytes by digest.
   *
   * @param digest - The content digest to look up
   * @returns The content bytes, or null if not found
   */
  getContent(digest: Uint8Array): Promise<Uint8Array | null>;
}
