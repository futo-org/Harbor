import { bytesToHex, v2 as Proto } from '@polycentric/js-core';
import { activeIdentityKey } from '../active-identity';
import { requestAsPromise } from '../request';
import type { IndexedDBMigration } from './index';

const IDENTITY_COLLECTION = 1;

interface LegacyKey {
  key_type: number;
  private_key: Uint8Array;
  public_key: Uint8Array;
}

/**
 * Replaces the `keys` store with the new `logins` store.
 *
 * The old store is kept as `legacyKeys`.
 * We migrate the first keypair as a login if it has an active identity.
 */
export const m000005_20261021_login_repository: IndexedDBMigration = {
  version: 5,
  async apply(transaction) {
    const db = transaction.db;

    // Rename old store
    const legacyKeys = transaction.objectStore('keys');
    legacyKeys.name = 'legacyKeys';

    // Create new store
    const logins = db.createObjectStore('logins', {
      keyPath: ['identity', 'keyType', 'publicKeyHex'],
    });

    // Create status index for efficient sweeping
    logins.createIndex('idx_logins_status', 'status');

    // Migrate existing key pair
    const [legacy] = await requestAsPromise<LegacyKey[]>(
      legacyKeys.getAll(undefined, 1),
    );
    if (!legacy) {
      return;
    }

    let identity: string | null;
    try {
      identity = localStorage.getItem(activeIdentityKey(legacy.public_key));
    } catch {
      identity = null;
    }

    if (!identity) {
      return;
    }

    const status = await lookupStatus(transaction, identity, legacy);

    await requestAsPromise(
      logins.add({
        identity,
        keyType: legacy.key_type,
        publicKeyHex: bytesToHex(legacy.public_key),
        status,
        privateKeyLocation: 'inline',
        privateKeyHex: bytesToHex(legacy.private_key),
      }),
    );
  },
};

/**
 * Derive the status of the legacy key pair from the latest identity event.
 * Falls back to `liveRotationKey` on failure.
 */
async function lookupStatus(
  transaction: IDBTransaction,
  identity: string,
  legacy: LegacyKey,
): Promise<string> {
  try {
    // Read all events
    const rows = await requestAsPromise(
      transaction
        .objectStore('events')
        .getAll(IDBKeyRange.bound([identity], [identity, []])),
      { preventAbort: true },
    );

    // Find latest identity event
    let latest: { sequence: number; eventBytes: Uint8Array } | null = null;

    for (const row of rows) {
      if (
        row.collection === IDENTITY_COLLECTION &&
        (!latest || row.sequence > latest.sequence)
      ) {
        latest = row;
      }
    }

    if (!latest) {
      return 'liveRotationKey';
    }

    // Get matching identity content
    const event = Proto.Event.fromBinary(latest.eventBytes);
    if (!event.contentDigest) {
      return 'liveRotationKey';
    }

    const digestHex = bytesToHex(
      Proto.ContentDigest.toBinary(event.contentDigest),
    );

    const row = await requestAsPromise(
      transaction.objectStore('content').get(digestHex),
      { preventAbort: true },
    );

    if (!row) {
      return 'liveRotationKey';
    }

    const content = Proto.Content.fromBinary(row.contentBytes);
    if (content.contentBody.oneofKind !== 'identity') {
      return 'liveRotationKey';
    }

    // Derive key pair status
    const doc = content.contentBody.identity;
    const matches = (key: Proto.PublicKey) => {
      if (key.keyType !== legacy.key_type) return false;
      return bytesEqual(key.key, legacy.public_key);
    };

    if (doc.rotationKeys.some(matches)) {
      return 'liveRotationKey';
    }

    if (doc.signingKeys.some(matches)) {
      return 'liveSigningKey';
    }

    return 'revoked';
  } catch {
    return 'liveRotationKey';
  }
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
