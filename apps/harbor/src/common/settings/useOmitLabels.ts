import { useSettings } from './index';
import type { ModerationPreferences } from './index';

const LABEL_MAP: Record<keyof ModerationPreferences, string> = {
  hate: 'hate',
  selfHarm: 'self-harm',
  sexuallySuggestive: 'sexually-suggestive',
  sexuallyExplicit: 'sexually-explicit',
  violence: 'violence',
};

/**
 * Returns the list of label values the user has chosen to hide in their
 * moderation preferences. Pass this as `omitLabels` in feed queries.
 */
export function useOmitLabels(): string[] {
  const moderation = useSettings((s) => s.moderation);
  return (Object.keys(LABEL_MAP) as (keyof ModerationPreferences)[])
    .filter((key) => moderation[key] === 'hide')
    .map((key) => LABEL_MAP[key]);
}
