import {
  bytesToHex,
  hexToBytes,
  type PolycentricClient,
  type PrivateKey,
  v2,
} from '@polycentric/react-native';

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
