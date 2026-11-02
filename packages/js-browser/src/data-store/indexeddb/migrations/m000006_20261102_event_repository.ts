import { bytesToHex, v2 as Proto } from '@polycentric/js-core';
import { requestAsPromise } from '../request';
import type { IndexedDBMigration } from './index';

interface LegacyEventRow {
  eventBytes: Uint8Array;
  signature: Uint8Array;
}

interface LegacyContentRow {
  digestHex: string;
  contentBytes: Uint8Array;
}

/**
 * Replaces the `events` and `content` stores with a new `events` store that
 * holds each event alongside its content.
 *
 * The old stores are kept as `legacyEvents` and `legacyContent`.
 * Events are copied with the identity as the owner, if a matching login exists.
 * Events that can't be migrated are skipped.
 */
export const m000006_20261102_event_repository: IndexedDBMigration = {
  version: 6,
  async apply(transaction) {
    const db = transaction.db;

    // Rename old stores
    const legacyEvents = transaction.objectStore('events');
    legacyEvents.name = 'legacyEvents';

    const legacyContent = transaction.objectStore('content');
    legacyContent.name = 'legacyContent';

    // Create new store
    const events = db.createObjectStore('events', {
      keyPath: [
        'owner',
        'eventKeyIdentity',
        'eventKeyPublicKeyType',
        'eventKeyPublicKeyBytes',
        'eventKeyCollection',
        'eventKeySequence',
      ],
    });

    // Derive the set of valid owners
    const logins = await requestAsPromise<{ identity: string }[]>(
      transaction.objectStore('logins').getAll(),
    );

    const owners = new Set(logins.map((login) => login.identity));

    // Read all legacy content for lookups
    const contentRows = await requestAsPromise<LegacyContentRow[]>(
      legacyContent.getAll(),
    );

    const contentByDigest = new Map(
      contentRows.map((row) => [row.digestHex, row.contentBytes]),
    );

    // Copy events
    const eventRows = await requestAsPromise<LegacyEventRow[]>(
      legacyEvents.getAll(),
    );

    const requests: Promise<IDBValidKey>[] = [];

    for (const row of eventRows) {
      let event: Proto.Event;

      // Skip events that don't decode
      try {
        event = Proto.Event.fromBinary(row.eventBytes);
      } catch {
        continue;
      }

      // Skip events without a valid event key
      const key = event.key;
      const signedBy = key?.signedBy;
      if (
        !key ||
        !signedBy ||
        !event.contentDigest ||
        !owners.has(key.identity) ||
        key.sequence > Number.MAX_SAFE_INTEGER
      ) {
        continue;
      }

      // Try to find the event's content
      const contentBytes = contentByDigest.get(
        bytesToHex(Proto.ContentDigest.toBinary(event.contentDigest)),
      );

      requests.push(
        requestAsPromise(
          events.add({
            owner: key.identity,
            eventKeyIdentity: key.identity,
            eventKeyPublicKeyType: signedBy.keyType,
            eventKeyPublicKeyBytes: signedBy.key,
            eventKeyCollection: key.collection,
            eventKeySequence: Number(key.sequence),
            eventBytes: row.eventBytes,
            eventSignature: row.signature,
            contentStatus: contentBytes ? 'present' : 'absent',
            contentBytes,
          }),
        ),
      );
    }

    await Promise.all(requests);
  },
};
