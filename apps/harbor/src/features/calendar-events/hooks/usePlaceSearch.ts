import { useDebouncedValue } from '@/src/features/search/hooks/useDebouncedValue';
import { useEffect, useState } from 'react';
import { type Place, searchPlaces } from '../lib/geocoder-api';

const MIN_QUERY_LENGTH = 3;

/** Debounced place search */
export function usePlaceSearch(query: string, enabled: boolean): Place[] {
  const [places, setPlaces] = useState<Place[]>([]);
  const debounced = useDebouncedValue(query.trim());

  useEffect(() => {
    if (!enabled || debounced.length < MIN_QUERY_LENGTH) {
      setPlaces([]);
      return;
    }

    const controller = new AbortController();

    searchPlaces(debounced, controller.signal)
      .then(setPlaces)
      // Search is optional, they can still type the place
      .catch(() => {
        if (!controller.signal.aborted) setPlaces([]);
      });

    return () => controller.abort();
  }, [debounced, enabled]);

  return places;
}
