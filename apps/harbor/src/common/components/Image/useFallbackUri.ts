import { useCallback, useState } from 'react';

const NONE: ReadonlySet<string> = new Set();

/**
 * Walk a list of candidate URLs, advancing to the next when one fails to
 * load. Lets a blob be retried across servers. Failures are held by URL, as
 * an image reports them late and by position they would skip a candidate.
 * Returns the current `uri` and an `onError` to wire into the image.
 */
export function useFallbackUri(candidates: string[]): {
  uri: string | undefined;
  /** Report the URL that failed to load; the next candidate takes over. */
  onError: (failedUri: string) => void;
} {
  const [failed, setFailed] = useState(NONE);

  const onError = useCallback((failedUri: string) => {
    setFailed((prev) =>
      prev.has(failedUri) ? prev : new Set(prev).add(failedUri),
    );
  }, []);

  const uri =
    candidates.find((candidate) => !failed.has(candidate)) ??
    candidates[candidates.length - 1];

  return { uri, onError };
}
