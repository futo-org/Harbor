import { useSettings } from './index';
import { getModerationLabels } from './moderationLabels';

/**
 * Returns the list of label values the user has chosen to hide in their
 * moderation preferences. Pass this as `omitLabels` in feed queries.
 */
export function useOmitLabels(): string[] {
  const moderation = useSettings((s) => s.moderation);
  return getModerationLabels().filter((label) => moderation[label] === 'hide');
}
