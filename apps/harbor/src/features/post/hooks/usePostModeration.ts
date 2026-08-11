import type { PostLabel } from '@/src/common/lib/polycentric-hooks/helpers';
import { type ModerationLabel, useSettings } from '@/src/common/settings';

export function usePostModeration(labels: PostLabel[] | undefined): {
  hasWarnContent: boolean;
  warnLabels: PostLabel[];
} {
  const moderation = useSettings((s) => s.moderation);

  if (!labels || labels.length === 0) {
    return { hasWarnContent: false, warnLabels: [] };
  }

  // `hide` filters posts out of feeds server-side; any that still reach
  // the client (threads, direct views) get the same warn treatment.
  const warnLabels = labels.filter((label) => {
    const level = moderation[label.value as ModerationLabel];
    return level === 'warn' || level === 'hide';
  });

  return {
    hasWarnContent: warnLabels.length > 0,
    warnLabels,
  };
}
