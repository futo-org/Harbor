import { publicEnv } from '@/src/common/util/env';

/** Public Photon instance. Fair use only */
const PUBLIC_PHOTON_SERVER = 'https://photon.komoot.io';

/** Photon servers for place search. Set with EXPO_PUBLIC_HARBOR_GEOCODER_SERVERS */
const GEOCODER_SERVERS: string[] = (() => {
  const parsed = (
    publicEnv(
      'EXPO_PUBLIC_HARBOR_GEOCODER_SERVERS',
      process.env.EXPO_PUBLIC_HARBOR_GEOCODER_SERVERS,
    ) ?? ''
  )
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => s.length > 0);

  return parsed.length > 0 ? parsed : [PUBLIC_PHOTON_SERVER];
})();

const TIMEOUT_MS = 8_000;
const MAX_RESULTS = 5;
/** Languages Photon supports */
const PHOTON_LANGUAGES = ['en', 'de', 'fr'];

export type Place = {
  id: string;
  name: string;
  /** Address without the name */
  address: string;
  latitude: number;
  longitude: number;
};

/** Single line label for a place */
export function placeLabel(place: Place): string {
  return place.address ? `${place.name}, ${place.address}` : place.name;
}

/** Fields we read from a Photon feature */
type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    housenumber?: string;
    street?: string;
    postcode?: string;
    city?: string;
    state?: string;
    country?: string;
  };
};

/** Photon feature to a Place */
export function placeFromFeature(feature: PhotonFeature): Place | null {
  const [longitude, latitude] = feature.geometry?.coordinates ?? [];
  const properties = feature.properties ?? {};

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }

  const street = [properties.housenumber, properties.street]
    .filter(Boolean)
    .join(' ');

  const parts = [
    street,
    properties.postcode,
    properties.city,
    properties.state,
    properties.country,
  ].filter((part): part is string => !!part);

  // Addresses without a name use the street
  const name = properties.name || parts.shift();
  if (!name) return null;

  return {
    id: `${properties.osm_type ?? ''}${properties.osm_id ?? `${latitude},${longitude}`}`,
    name,
    address: parts.filter((part) => part !== name).join(', '),
    latitude,
    longitude,
  };
}

/** Search Photon (https://github.com/komoot/photon). Tries each server in order */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  servers = GEOCODER_SERVERS,
): Promise<Place[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(MAX_RESULTS),
  });

  const language = Intl.DateTimeFormat().resolvedOptions().locale.slice(0, 2);
  if (PHOTON_LANGUAGES.includes(language)) params.set('lang', language);

  let failure: unknown;

  for (const server of servers) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort);
    const timeout = setTimeout(abort, TIMEOUT_MS);

    try {
      const res = await fetch(`${server}/api?${params}`, {
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Geocoder request failed (${res.status})`);

      const body = (await res.json()) as { features?: PhotonFeature[] };

      return (body.features ?? [])
        .map(placeFromFeature)
        .filter((place) => place !== null);
    } catch (err) {
      if (signal?.aborted) throw err;

      failure = err;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }

  throw failure ?? new Error('No geocoder is configured');
}
