export const BACKUP_MIME = 'text/plain';

/**
 * Try to save the backup file.
 * In reality, control is handed to the user and they can save it or cancel.
 */
export type SaveBackupFile = (name: string, contents: string) => Promise<void>;
