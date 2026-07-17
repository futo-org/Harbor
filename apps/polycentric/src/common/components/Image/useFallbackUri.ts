import { useCallback, useEffect, useState } from 'react';

/**
 * Walk a list of candidate URLs, advancing to the next when one fails to
 * load. Lets a blob be retried across servers. Resets when the list changes.
 * Returns the current `uri` and an `onError` to wire into the image.
 */
export function useFallbackUri(candidates: string[]): {
  uri: string | undefined;
  onError: () => void;
} {
  const key = candidates.join('\n');
  const [index, setIndex] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the reset trigger, not a capture
  useEffect(() => setIndex(0), [key]);

  const onError = useCallback(() => {
    setIndex((i) => (i + 1 < candidates.length ? i + 1 : i));
  }, [candidates.length]);

  return { uri: candidates[index], onError };
}
