import { anywhereUrlFromSegments } from '@/src/common/util/anywhere-url';
import { useLocalSearchParams } from 'expo-router';

/** The web address the current `/anywhere/u/<domain>/<path>` route is for. */
export function useAnywhereUrl(): string | undefined {
  // The router has already decoded the segments (see `encodeAnywhereUrl`).
  const { domain, path } = useLocalSearchParams<{
    domain: string;
    path?: string[];
  }>();
  return anywhereUrlFromSegments(domain, path);
}
