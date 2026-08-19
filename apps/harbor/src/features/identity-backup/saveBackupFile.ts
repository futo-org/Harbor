import {
  BACKUP_MIME,
  type SaveBackupFile,
} from '@/src/features/identity-backup/saveBackupFile.types';
import {
  errorCodes,
  isErrorWithCode,
  saveDocuments,
} from '@react-native-documents/picker';
import { File, Paths } from 'expo-file-system';

/**
 * Hand the backup to the system save dialog.
 */
export const saveBackupFile: SaveBackupFile = async (name, contents) => {
  // We will create a temp file in the app cache and delete it after
  const file = new File(Paths.cache, name);
  const deleteFile = () => {
    try {
      if (file.exists) file.delete();
    } catch (err: unknown) {
      console.warn('Failed to delete the temporary backup file:', err);
    }
  };

  try {
    deleteFile();
    file.create();
    file.write(contents);

    const [saved] = await saveDocuments({
      sourceUris: [file.uri],
      mimeType: BACKUP_MIME,
      fileName: name,
      copy: false,
    });

    if (saved.error) throw new Error(saved.error);
  } catch (err: unknown) {
    // We will allow the user to cancel without consequence
    if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
      return;
    }

    throw err;
  } finally {
    deleteFile();
  }
};
