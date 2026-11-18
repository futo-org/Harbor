jest.mock('@polycentric/react-native', () => ({
  COLLECTION: jest.requireActual(
    '../../../../../../packages/js-core/src/constants',
  ).COLLECTION,
}));

jest.mock('expo-router', () => ({ router: {} }));

import { COLLECTION } from '@polycentric/react-native';
import { eventRoute } from './eventRoute';

const IDENTITY = 'identity';
const signedBy = { keyType: 1, key: new Uint8Array(10).fill(0xab) };
// Fingerprints are the first 16 characters of the signer's key.
const FINGERPRINT = 'abababababababab';

const key = (collection: number, sequence: bigint | string = 7n) => ({
  collection,
  identity: IDENTITY,
  signedBy,
  sequence,
});

describe('eventRoute', () => {
  it("routes a post to its thread, whatever the sequence's type", () => {
    const route = `/${IDENTITY}/post/${FINGERPRINT}/7`;
    expect(eventRoute(key(COLLECTION.FEED, 7n))).toBe(route);
    expect(eventRoute(key(COLLECTION.FEED, '7'))).toBe(route);
  });

  it("can't route a post without a signer", () => {
    expect(
      eventRoute({ ...key(COLLECTION.FEED), signedBy: undefined }),
    ).toBeNull();
  });

  it('routes profile and identity updates to the profile', () => {
    expect(eventRoute(key(COLLECTION.PROFILE))).toBe(`/${IDENTITY}`);
    expect(eventRoute(key(COLLECTION.IDENTITY))).toBe(`/${IDENTITY}`);
  });

  it('has no route for events without a page of their own', () => {
    for (const collection of [
      COLLECTION.INTERACTIONS,
      COLLECTION.GRAPH,
      COLLECTION.REPORTS,
      COLLECTION.LABELS,
      COLLECTION.VERIFICATIONS,
      99,
    ]) {
      expect(eventRoute(key(collection))).toBeNull();
    }
  });
});
