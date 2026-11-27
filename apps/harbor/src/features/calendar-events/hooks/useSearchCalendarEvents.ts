import { useQuery } from '@/src/common/query/hooks/useQuery';
import { useDebouncedValue } from '@/src/features/search/hooks/useDebouncedValue';
import { Query, v2 } from '@polycentric/react-native-sdk';
import { useMemo } from 'react';
import { calendarQueryKeys } from '../lib/calendar-queries';
import { decodeCalendarEvents } from './useCalendarEvents';

/** Debounced event search */
export function useSearchCalendarEvents(text: string) {
  const query = useDebouncedValue(text.trim(), 300);
  const enabled = query.length > 0;

  const result = useQuery(
    calendarQueryKeys.search(query),
    new Query.SearchCalendarEvents({
      query,
      limit: 20,
      backwardToken: undefined,
      forwardToken: undefined,
    }),
    undefined,
    enabled,
  );

  const events = useMemo(
    () =>
      enabled
        ? decodeCalendarEvents(result.data, (bytes) =>
            v2.SearchCalendarEventsResponse.fromBinary(bytes),
          )
        : [],
    [enabled, result.data],
  );

  return {
    events,
    /** True when there's a query */
    isSearching: text.trim().length > 0,
    isLoading: enabled && result.isLoading,
  };
}
