export interface ProfileHookResult {
  description: string | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

// TODO: resolve a profile's description/metadata via `listEvents` for the
// identity's IDENTITY collection once the v2 content manager is ported.
export function useProfile(
  _identityKey: string | null | undefined,
  _options?: { getIsAborted?: () => boolean },
): ProfileHookResult {
  return {
    description: null,
    isLoading: false,
    error: null,
    refresh: () => {},
  };
}
