import { useTimeAgo } from '@/src/common/components/TimeAgo';
import { useLastSync } from '@/src/features/core/sync-status/useLastSyncStore';

/** Returns a string for displaying the last time this identity synced. */
export function useLastSyncedLabel(identityKey: string | null): string {
  const lastSync = useLastSync(identityKey);
  const ago = useTimeAgo(lastSync ?? 0);

  if (lastSync === undefined) return 'Not synced yet';
  if (ago === 'now') return 'Last synced just now';
  // Relative labels ("5m") read as "5m ago"; past a week the label is a date
  return /^\d+[mhd]$/.test(ago)
    ? `Last synced ${ago} ago`
    : `Last synced ${ago}`;
}
