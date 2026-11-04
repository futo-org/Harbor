import { backupInfo } from '@polycentric/react-native';

/**
 * Backups are created, checked and restored by rs-core
 * (`client.createBackup`, `client.checkBackup`, `client.recoverFromBackup`);
 * the text is opaque to the app.
 */

/** Derive the backup's file name. Throws if `backup` isn't a backup. */
export function backupFileName(backup: string): string {
  const { identityKey, sequence } = backupInfo(backup);
  return `harbor-backup-${identityKey.slice(0, 10)}-${sequence}.txt`;
}

/** The identity a backup is for, or `undefined` if it isn't one. */
export function backupIdentity(backup: string): string | undefined {
  try {
    return backupInfo(backup).identityKey;
  } catch {
    return undefined;
  }
}
