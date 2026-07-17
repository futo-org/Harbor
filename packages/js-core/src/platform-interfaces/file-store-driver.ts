import type * as Proto from '../proto/v2';

/**
 * Client-side blob storage for server `/blob/` files (profile pictures,
 * post attachments, etc).
 */
export interface IFileStoreDriver {
  has(digest: Proto.ContentDigest): Promise<boolean>;
  get(digest: Proto.ContentDigest): Promise<Uint8Array | null>;
  put(digest: Proto.ContentDigest, bytes: Uint8Array): Promise<void>;
  delete(digest: Proto.ContentDigest): Promise<void>;
}
