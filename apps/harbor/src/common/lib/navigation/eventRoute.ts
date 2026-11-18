import { Routes } from '@/src/common/constants';
import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';
import { COLLECTION, type v2 } from '@polycentric/react-native';
import type { Href } from 'expo-router';

/** The parts of an event key that locate an event, for routing. */
export type EventLocation = Pick<
  v2.EventKey,
  'collection' | 'identity' | 'signedBy'
> & { sequence: bigint | string };

/**
 * Given an event, returns the route where that event should be viewed or focused. For example,
 * a feed post should be viewed in its thread route, and a profile event can be seen in the profile
 * route.
 *
 * Note this function currently returns null for reactions, follows, reports, labels, and
 * verification events.
 */
export function eventRoute(key: EventLocation): Href | null {
  switch (key.collection) {
    case COLLECTION.FEED: {
      const fingerprint = getKeyFingerprint(key.signedBy);
      return fingerprint
        ? Routes.tabs.post(key.identity, fingerprint, String(key.sequence))
        : null;
    }
    case COLLECTION.PROFILE:
    case COLLECTION.IDENTITY:
      return Routes.tabs.profile(key.identity);
    default:
      return null;
  }
}
