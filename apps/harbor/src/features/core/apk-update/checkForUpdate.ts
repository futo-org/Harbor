import { toast } from '@/src/common/components/toast';
import { POLYCENTRIC_STATIC_URL } from '@/src/common/constants';
import { isAndroid } from '@/src/common/util/platform';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { type UpdateInfo, useUpdateStore } from './hooks/useUpdateStore';

const FETCH_TIMEOUT_MS = 10_000;

/** Only sideloaded Android builds self-update. Store builds are signed by
 *  Play, so our APKs can never install over them (see APP_DISTRIBUTION in
 *  eas.json). */
export function canSelfUpdate(): boolean {
  return isAndroid && Constants.expoConfig?.extra?.distribution !== 'store';
}

/** Staging installs poll the staging feed; everything else production. */
export function updateManifestUrl(): string {
  const variant = Constants.expoConfig?.extra?.variant;
  const channel = variant === 'staging' ? 'staging' : 'production';
  return `${POLYCENTRIC_STATIC_URL}/apk/${channel}/latest.json`;
}

function parseManifest(data: unknown): UpdateInfo | null {
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  if (
    typeof m.package !== 'string' ||
    typeof m.versionName !== 'string' ||
    typeof m.url !== 'string' ||
    !Number.isInteger(m.versionCode)
  ) {
    return null;
  }
  return {
    package: m.package,
    channel: typeof m.channel === 'string' ? m.channel : '',
    versionName: m.versionName,
    versionCode: m.versionCode as number,
    url: m.url,
    sha256: typeof m.sha256 === 'string' ? m.sha256 : '',
    notes: typeof m.notes === 'string' ? m.notes : '',
    publishedAt: typeof m.publishedAt === 'string' ? m.publishedAt : '',
  };
}

/**
 * Check the update feed and open the sheet if a newer APK qualifies.
 * Auto checks are silent and skip a skipped version; manual checks toast
 * errors and re-offer a skipped version.
 */
export async function checkForUpdate({
  manual,
}: {
  manual: boolean;
}): Promise<void> {
  if (!canSelfUpdate()) return;

  const store = useUpdateStore.getState();

  let info: UpdateInfo | null = null;
  try {
    const response = await fetch(updateManifestUrl(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
    info = parseManifest(await response.json());
    if (!info) throw new Error('malformed update manifest');
  } catch (err) {
    if (manual) {
      toast.error('Could not check for updates');
    } else {
      console.warn(`update check failed: ${err}`);
    }
    return;
  }

  const installedCode = Number(Application.nativeBuildVersion);
  const isNewer =
    info.package === Application.applicationId &&
    Number.isFinite(installedCode) &&
    info.versionCode > installedCode;

  if (!isNewer) {
    if (manual) toast.success("You're on the latest version");
    return;
  }

  if (!manual && info.versionCode === store.skippedVersionCode) return;

  store.setAvailable(info);
}
