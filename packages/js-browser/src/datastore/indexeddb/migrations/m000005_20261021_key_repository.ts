import { bytesToHex, v2 as Proto } from '@polycentric/js-core';
import { activeIdentityKey } from '../active-identity';
import type { IndexedDBMigration } from './index';

const IDENTITY_COLLECTION = 1;

interface LegacyKey {
  key_type: number;
  private_key: Uint8Array;
  public_key: Uint8Array;
}

/**
 * Replaces the `keys` store with the new key repository schema.
 *
 * The old store is kept as `legacyKeys`.
 * We migrate the first keypair if it has an active identity.
 */
export const m000005_20261021_key_repository: IndexedDBMigration = {
  version: 5,
  apply(transaction) {
    const db = transaction.db;

    // Rename old store
    const legacyKeys = transaction.objectStore('keys');
    legacyKeys.name = 'legacyKeys';

    // Create new store
    const keys = db.createObjectStore('keys', {
      keyPath: ['identity', 'keyType', 'publicKeyHex'],
    });

    // Create status index for efficient sweeping
    keys.createIndex('idx_keys_status', 'status');

    // Migrate existing key pair
    const cursorRequest = legacyKeys.openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        return;
      }

      const legacy = cursor.value as LegacyKey;

      let identity: string | null;
      try {
        identity = localStorage.getItem(activeIdentityKey(legacy.public_key));
      } catch {
        identity = null;
      }

      if (!identity) {
        return;
      }

      const migrate = (status: string) => {
        keys.add({
          identity,
          keyType: legacy.key_type,
          publicKeyHex: bytesToHex(legacy.public_key),
          status,
          privateKeyLocation: 'inline',
          privateKeyHex: bytesToHex(legacy.private_key),
        });
      };

      migrateWithStatus(transaction, identity, legacy, migrate);
    };
  },
};

/**
 * Derive the status of the legacy key pair and migrate it.
 * Falls back to `liveRotationKey` on failure.
 */
function migrateWithStatus(
  transaction: IDBTransaction,
  identity: string,
  legacy: LegacyKey,
  done: (status: string) => void,
): void {
  const fallback = () => done('liveRotationKey');
  const suppress = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    fallback();
  };

  let latest: { sequence: number; eventBytes: Uint8Array } | null = null;

  const eventsRequest = transaction
    .objectStore('events')
    .openCursor(IDBKeyRange.bound([identity], [identity, []]));

  eventsRequest.onerror = suppress;

  eventsRequest.onsuccess = () => {
    const cursor = eventsRequest.result;

    if (cursor) {
      const row = cursor.value;
      if (
        row.collection === IDENTITY_COLLECTION &&
        (!latest || row.sequence > latest.sequence)
      ) {
        latest = { sequence: row.sequence, eventBytes: row.eventBytes };
      }
      cursor.continue();
      return;
    }

    if (!latest) {
      fallback();
      return;
    }

    let digestHex: string;
    try {
      const event = Proto.Event.fromBinary(latest.eventBytes);

      if (!event.contentDigest) {
        fallback();
        return;
      }

      digestHex = bytesToHex(Proto.ContentDigest.toBinary(event.contentDigest));
    } catch {
      fallback();
      return;
    }

    const contentRequest = transaction.objectStore('content').get(digestHex);

    contentRequest.onerror = suppress;

    contentRequest.onsuccess = () => {
      let doc: Proto.Identity;

      try {
        const row = contentRequest.result;

        if (!row) {
          fallback();
          return;
        }

        const content = Proto.Content.fromBinary(row.contentBytes);
        if (content.contentBody.oneofKind !== 'identity') {
          fallback();
          return;
        }

        doc = content.contentBody.identity;
      } catch {
        fallback();
        return;
      }

      const matches = (key: Proto.PublicKey) => {
        if (key.keyType !== legacy.key_type) return false;
        return bytesEqual(key.key, legacy.public_key);
      };

      if (doc.rotationKeys.some(matches)) {
        done('liveRotationKey');
      } else if (doc.signingKeys.some(matches)) {
        done('liveSigningKey');
      } else {
        done('revoked');
      }
    };
  };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
