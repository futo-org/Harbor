import {
  moderationLabels,
  isModerationLabel as isModerationLabelFfi,
} from '@polycentric/react-native';

/**
 * The moderation label vocabulary, mirroring `ModerationLabel` in rs-common.
 *
 * The uniffi bindings flatten that enum to plain strings, so the union is
 * spelled out here to give the client compile-time keys (see
 * `ModerationPreferences`). Match `rs-common` if it is ever updated.
 */
export type ModerationLabel =
  | 'hate'
  | 'self-harm'
  | 'sexually-suggestive'
  | 'sexually-explicit'
  | 'violence';

/** Whether `value` is one of the defined moderation labels. */
export const isModerationLabel = isModerationLabelFfi as (
  value: string,
) => value is ModerationLabel;

/** Every moderation label value, in canonical order. */
export function getModerationLabels(): readonly ModerationLabel[] {
  return moderationLabels() as ModerationLabel[];
}

export function moderationLabelFromValue(
  value: string,
): ModerationLabel | undefined {
  return isModerationLabel(value) ? value : undefined;
}

/** A moderation label paired with its display name and description. */
export type ModerationLabelEntry = {
  key: ModerationLabel;
  name: string;
  description: string;
};

const LABEL_ENTRIES: readonly ModerationLabelEntry[] = [
  {
    key: 'hate',
    name: 'Hate',
    description: 'Hate speech or incitement against groups',
  },
  {
    key: 'self-harm',
    name: 'Self-Harm',
    description: 'Self-harm, eating disorders, suicide',
  },
  {
    key: 'sexually-suggestive',
    name: 'Sexually Suggestive',
    description: 'Innuendo or implied sexual acts',
  },
  {
    key: 'sexually-explicit',
    name: 'Sexually Explicit',
    description: 'Pornography or explicit sexual acts',
  },
  {
    key: 'violence',
    name: 'Violence',
    description: 'Violent acts, gore, injury, or terrorism',
  },
] as const;

/** Every moderation label paired with its display name and description. */
export function getModerationLabelEntries(): ModerationLabelEntry[] {
  return [...LABEL_ENTRIES];
}

export function moderationLabelName(label: string): string {
  return LABEL_ENTRIES.find((e) => e.key === label)?.name ?? label;
}
