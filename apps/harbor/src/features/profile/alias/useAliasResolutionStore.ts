import { create } from 'zustand';
import { isIdentityKey, parseAlias } from './helpers';

// Give up on a slow or unresponsive domain rather than hang the resolution.
const RESOLVE_TIMEOUT_MS = 10_000;

interface AliasResolutionStore {
  // Settled results, keyed by normalized alias (`normalizeAlias`); null when
  // the alias resolved to nothing. Read by the UI.
  identityByAlias: Record<string, string | null>;
  // The latest request for each alias, in flight or settled.
  identityPromiseByAlias: Record<string, Promise<string | null>>;
  // Requests each alias once per session. `force` makes a new request (for
  // mutations like saving an alias); its result replaces the cached one.
  resolveAlias: (
    alias: string,
    options?: { force?: boolean },
  ) => Promise<string | null>;
}

export const useAliasResolutionStore = create<AliasResolutionStore>(
  (set, get) => ({
    identityByAlias: {},
    identityPromiseByAlias: {},
    resolveAlias: (alias, options) => {
      const parsed = parseAlias(alias);
      if (!parsed) return Promise.resolve(null);

      const { normalizedAlias } = parsed;

      const cachedPromise = get().identityPromiseByAlias[normalizedAlias];
      if (cachedPromise && !options?.force) return cachedPromise;

      const promise = fetchAliasIdentity(parsed).then((identity) => {
        // If a forced request started later, it would have the newer answer.
        if (get().identityPromiseByAlias[normalizedAlias] !== promise) {
          return identity;
        }

        set((state) => ({
          identityByAlias: {
            ...state.identityByAlias,
            [normalizedAlias]: identity,
          },
        }));

        return identity;
      });

      set((state) => ({
        identityPromiseByAlias: {
          ...state.identityPromiseByAlias,
          [normalizedAlias]: promise,
        },
      }));

      return promise;
    },
  }),
);

// For mutations like saving an alias: a new request even when one is cached.
export function forceResolveAlias(alias: string): Promise<string | null> {
  return useAliasResolutionStore
    .getState()
    .resolveAlias(alias, { force: true });
}

// True once `normalizedAlias` has settled to nothing or to another identity;
// false while it's still pending.
export function isAliasVerificationFailed(
  normalizedAlias: string,
  identity: string,
): boolean {
  const resolvedIdentity =
    useAliasResolutionStore.getState().identityByAlias[normalizedAlias];

  return (
    resolvedIdentity !== undefined &&
    resolvedIdentity?.toLowerCase() !== identity.toLowerCase()
  );
}

// Null when the request fails or the domain lists no valid identity for the
// alias.
async function fetchAliasIdentity({
  normalizedAlias,
  localPart,
  domain,
}: NonNullable<ReturnType<typeof parseAlias>>): Promise<string | null> {
  const url = `https://${domain}/.well-known/polycentric.json`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);

  let doc: { names?: Record<string, string> } | null;

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    // A 404 just means the domain doesn't know this alias: not worth a warning.
    if (!response.ok) return null;
    doc = await response.json();
  } catch (error) {
    // Network error, timeout or unparseable body.
    console.warn(`alias resolution failed for ${normalizedAlias}:`, error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }

  const identity = doc?.names?.[localPart];
  if (!identity || !isIdentityKey(identity)) return null;

  return identity;
}
