jest.mock('@/src/common/util/env', () => ({ publicEnv: () => undefined }));

import { placeFromFeature, searchPlaces } from './geocoder-api';

const feature = (properties: object) => ({
  geometry: { coordinates: [-0.1276, 51.5072] as [number, number] },
  properties,
});

describe('placeFromFeature', () => {
  it('splits a venue into its name and address', () => {
    const place = placeFromFeature(
      feature({
        osm_type: 'N',
        osm_id: 42,
        name: 'The Anchor',
        housenumber: '34',
        street: 'Park Street',
        city: 'London',
      }),
    );

    expect(place).toEqual({
      id: 'N42',
      name: 'The Anchor',
      address: '34 Park Street, London',
      latitude: 51.5072,
      longitude: -0.1276,
    });
  });

  it('names an address by its street', () => {
    const place = placeFromFeature(
      feature({ housenumber: '34', street: 'Park Street', city: 'London' }),
    );

    expect(place).toMatchObject({ name: '34 Park Street', address: 'London' });
  });
});

describe('searchPlaces', () => {
  afterEach(() => jest.restoreAllMocks());

  it('falls back to the next server when one fails', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ features: [feature({ name: 'The Anchor' })] }),
      } as Response);

    const places = await searchPlaces('anchor', undefined, [
      'https://a.example',
      'https://b.example',
    ]);

    expect(places.map((place) => place.name)).toEqual(['The Anchor']);
    expect(String(fetchMock.mock.calls[1]?.[0])).toMatch(
      /^https:\/\/b\.example\/api\?q=anchor/,
    );
  });
});
