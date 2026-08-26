import { useSuggestedFollows } from './useSuggestedFollows';
import { useMemo } from 'react';

export function useAbbreviatedSuggestedFollows(
  enabled: boolean,
  limit: number,
) {
  const suggestions = useSuggestedFollows(enabled);

  return useMemo(
    () => ({
      isLoading: suggestions.isLoading,
      // using soft limit to avoid conflicting with the main query
      entries: suggestions.entries.slice(0, limit),
      hasMore: suggestions.hasMore || suggestions.entries.length > limit,
    }),
    [suggestions.entries, suggestions.hasMore, suggestions.isLoading, limit],
  );
}
