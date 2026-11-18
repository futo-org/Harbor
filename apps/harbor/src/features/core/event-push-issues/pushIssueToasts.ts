import { toast } from '@/src/common/components/toast/useToast';
import { Routes } from '@/src/common/constants/routes';
import { ffiEventKeyId } from '@/src/common/lib/polycentric-hooks/helpers';
import { router } from 'expo-router';
import type { EventPushIssue } from './useEventPushIssuesStore';

const ERROR_DURATION_MS = 8000;
const WARNING_DURATION_MS = 6000;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const dedupIssueCount = (issues: EventPushIssue[]) =>
  new Set(issues.map((i) => ffiEventKeyId(i.key))).size;

/**
 * Show at most one toast for errors and one toast for warnings encountered when pushing to
 * servers. Pressing a toast opens the sync events page, which lists the errors/warnings.
 */
export function showPushIssueToasts(added: EventPushIssue[]) {
  const errors = added.filter((i) => i.errors.length > 0);
  const warnings = added.filter(
    (i) => i.errors.length === 0 && i.warnings.length > 0,
  );
  const onPress = () => router.navigate(Routes.tabs.settings.syncEvents);

  if (errors.length > 0) {
    toast.error(`${plural(dedupIssueCount(errors), 'event')} not saved`, {
      duration: ERROR_DURATION_MS,
      onPress,
    });
  }
  if (warnings.length > 0) {
    toast.warning(
      `${plural(dedupIssueCount(warnings), 'event')} saved without content`,
      { duration: WARNING_DURATION_MS, onPress },
    );
  }
}
