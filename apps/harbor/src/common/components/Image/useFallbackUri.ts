import { useCallback, useState } from 'react';

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
  const [state, setState] = useState({ key, index: 0 });

  // Reset synchronously on a new candidate list as an effect lands a render
  // late, letting a recycled row read the previous row's fallback index.
  if (state.key !== key) setState({ key, index: 0 });
  const index = state.key === key ? state.index : 0;

  const onError = useCallback(() => {
    setState((s) =>
      s.index + 1 < candidates.length ? { ...s, index: s.index + 1 } : s,
    );
  }, [candidates.length]);

  return { uri: candidates[index], onError };
}
