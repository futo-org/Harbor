import { type ModerationLabel, useSettings } from '@/src/common/settings';

export function usePostModeration(labels: string[] | undefined): {
  hasWarnContent: boolean;
  warnLabels: string[];
} {
  const moderation = useSettings((s) => s.moderation);

  if (!labels || labels.length === 0) {
    return { hasWarnContent: false, warnLabels: [] };
  }

  const warnLabels = labels.filter(
    (label) => moderation[label as ModerationLabel] === 'warn',
  );

  return {
    hasWarnContent: warnLabels.length > 0,
    warnLabels,
  };
}
