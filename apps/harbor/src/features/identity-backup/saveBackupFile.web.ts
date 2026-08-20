import {
  BACKUP_MIME,
  type SaveBackupFile,
} from '@/src/features/identity-backup/saveBackupFile.types';

/**
 * Hand the backup to the browser as a download.
 */
export const saveBackupFile: SaveBackupFile = async (name, contents) => {
  const blob = new Blob([contents], { type: BACKUP_MIME });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();

  // Do cleanup, but ensure it's after the download
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
