import {
  bytesToHex,
  hexToBytes,
  type PolycentricClient,
  type PrivateKey,
  v2,
  KeyType,
  IdentityManager,
} from '@polycentric/react-native';
import { ed25519 } from '@noble/curves/ed25519.js';

/**
 * Encode a backup for storage.
 */
export function encodeIdentityBackup(backup: v2.IdentityBackup): string {
  return bytesToHex(v2.IdentityBackup.toBinary(backup));
}

/**
 * Decode a user-supplied backup string.
 */
export function decodeIdentityBackup(
  backup: string,
): v2.IdentityBackup | undefined {
  const bytes = hexToBytes(backup.trim());
  if (!bytes) return undefined;

  try {
    return v2.IdentityBackup.fromBinary(bytes);
  } catch {
    return undefined;
  }
}

/**
 * Build a backup of the active identity for the provided recovery private key.
 */
export function assembleIdentityBackup(
  client: PolycentricClient,
  recoveryPrivateKey: PrivateKey,
): v2.IdentityBackup {
  const identityKey = client.activeIdentityKey;
  if (!identityKey) throw new Error('No active identity to back up');

  return v2.IdentityBackup.create({
    identityKey,
    identityChain: client.resolveIdentityChain(identityKey),
    recoveryKey: recoveryPrivateKey,
  });
}

/** Derive backup filename. */
export function backupFileName(backup: v2.IdentityBackup): string {
  const id = backup.identityKey.slice(0, 10);
  const head = backup.identityChain[backup.identityChain.length - 1];
  const sequence = head?.signedEvent
    ? v2.Event.fromBinary(head.signedEvent.eventBytes).key?.sequence
    : undefined;

  if (sequence === undefined)
    throw new Error('Backup has no valid identity events');

  return `harbor-backup-${id}-${sequence}.txt`;
}

/**
 * Returns true if the recovery key in the backup is for an older state of
 * the identity.
 * Call this if the backup fails a recovery or test, and we want to know if the
 * reason is that it's outdated.
 * Assumes that rs-core already has this identity's identity events.
 */
export function isStaleBackup(
  client: PolycentricClient,
  backup: v2.IdentityBackup,
): boolean {
  if (backup.recoveryKey?.keyType !== KeyType.ED25519) return false;

  try {
    const publicKey: v2.PublicKey = {
      keyType: KeyType.ED25519,
      key: ed25519.getPublicKey(backup.recoveryKey.key),
    };

    /** Check if a bundle has a matching recovery key. */
    const keyMatches = (bundle: v2.EventBundle): boolean => {
      if (!bundle.serializedContent) return false;

      const content = v2.Content.fromBinary(
        bundle.serializedContent.contentBytes,
      );

      if (content.contentBody.oneofKind !== 'identity') return false;

      const identity = content.contentBody.identity;
      if (!identity.recoveryKey) return false;

      return IdentityManager.keysEqual(publicKey, identity.recoveryKey);
    };

    // Get the identity head and the chain of past states
    const chain = client.resolveIdentityChain(backup.identityKey);
    const head = chain.pop();

    // We only care about the case where the backup is valid but contains
    // a recovery key that has already been rotated out
    if (!head || keyMatches(head)) return false;

    // See if the backup's key matches any stale key
    return chain.some(keyMatches);
  } catch {
    return false;
  }
}
