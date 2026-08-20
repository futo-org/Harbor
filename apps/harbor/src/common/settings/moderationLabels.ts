import {
  isModerationLabel as isModerationLabelFfi,
  moderationLabelEntries,
  moderationLabels,
} from '@polycentric/react-native';
import type { ModerationLabelEntry as ModerationLabelEntryFfi } from '@polycentric/react-native';

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
export type ModerationLabelEntry = Omit<ModerationLabelEntryFfi, 'key'> & {
  key: ModerationLabel;
};

/** Every moderation label paired with its display name and description. */
export function getModerationLabelEntries(): ModerationLabelEntry[] {
  return moderationLabelEntries() as ModerationLabelEntry[];
}

export function moderationLabelName(label: string): string {
  return (
    getModerationLabelEntries().find((e) => e.key === label)?.name ?? label
  );
}
