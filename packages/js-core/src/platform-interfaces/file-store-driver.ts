/**
 * Thin wrapper over a client platform's file system.
 */
export interface IFileStoreDriver {
  has(path: string): Promise<boolean>;
  get(path: string): Promise<Uint8Array | null>;
  put(path: string, bytes: Uint8Array): Promise<void>;
  delete(path: string): Promise<boolean>;
}

/**
 * Split an `IFileStoreDriver` path into its segments.
 * Paths must have at least one segment.
 * `.`, `..`, and paths containing `\` are disallowed.
 */
export function segmentsFromPath(path: string): string[] {
  if (path.includes('\\')) {
    throw new Error(`Invalid file store path (contains '\\'): ${path}`);
  }

  const segments = path.split('/').filter((s) => s);

  if (segments.some((s) => s === '.' || s === '..')) {
    throw new Error(`Invalid file store path (contains '.' or '..'): ${path}`);
  }
  if (segments.length === 0) {
    throw new Error(`Invalid file store path (empty): ${path}`);
  }

  return segments;
}
