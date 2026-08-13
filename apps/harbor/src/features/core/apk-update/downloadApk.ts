import { Directory, File, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { type UpdateInfo, useUpdateStore } from './hooks/useUpdateStore';

// Intent.FLAG_GRANT_READ_URI_PERMISSION, so the installer can read our URI.
const FLAG_GRANT_READ_URI_PERMISSION = 1;

let activeAbort: AbortController | null = null;

export function cancelApkDownload(): void {
  activeAbort?.abort();
}

/** Download the APK into the cache and hand it to the system installer. */
export async function downloadAndInstallApk(info: UpdateInfo): Promise<void> {
  const { setDownloading, setInstalling, setError, resetPhase } =
    useUpdateStore.getState();

  activeAbort?.abort();
  const abort = new AbortController();
  activeAbort = abort;

  setDownloading(null);

  try {
    // Drop APKs left over from earlier attempts.
    const dir = new Directory(Paths.cache, 'apk-updates');
    if (dir.exists) dir.delete();
    dir.create({ intermediates: true });

    const task = File.createDownloadTask(info.url, dir, {
      signal: abort.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        setDownloading(totalBytes > 0 ? bytesWritten / totalBytes : null);
      },
    });

    const file = await task.downloadAsync();
    if (!file) throw new Error('download did not complete');

    setInstalling();

    const contentUri = await getContentUriAsync(file.uri);
    await IntentLauncher.startActivityAsync(
      'android.intent.action.INSTALL_PACKAGE',
      {
        data: contentUri,
        flags: FLAG_GRANT_READ_URI_PERMISSION,
      },
    );

    // The installer can be dismissed without installing; leave a retry path.
    resetPhase();
  } catch (err) {
    if (abort.signal.aborted) {
      resetPhase();
      return;
    }
    console.warn(`update download failed: ${err}`);
    setError('The download failed. Try again.');
  } finally {
    if (activeAbort === abort) activeAbort = null;
  }
}
