// A page is served with the app's own metadata rather than held up
const LOOKUP_TIMEOUT_MS = 2_000;
const TTL_MS = 60_000;
const MAX_ENTRIES = 2_000;

const entries = new Map<
  string,
  { value: Promise<unknown>; expiresAt: number }
>();

/** Runs `load` once a minute per key. A failed or slow load resolves to null */
export function cached<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
): Promise<T | null> {
  const entry = entries.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.value as Promise<T | null>;
  }

  const value = load(AbortSignal.timeout(LOOKUP_TIMEOUT_MS)).catch((error) => {
    entries.delete(key);
    console.warn(`seo: no metadata for ${key}:`, error);
    return null;
  });

  if (entries.size >= MAX_ENTRIES) entries.clear();
  entries.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}
