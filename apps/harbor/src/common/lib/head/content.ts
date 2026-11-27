import { DEFAULT_SERVER } from '@/src/common/lib/polycentric-hooks';
import {
  type ContentKind,
  bytesToHex,
  decodeBundle,
  getKeyFingerprint,
} from '@/src/common/lib/polycentric-hooks/helpers';
import type { ModerationLabel } from '@/src/common/settings/moderationLabels';
import type { v2 } from '@polycentric/react-native-sdk';

// Listed here because `getModerationLabels` needs the wasm core
export const MODERATION_LABELS: ModerationLabel[] = [
  'hate',
  'self-harm',
  'sexually-suggestive',
  'sexually-explicit',
  'violence',
];

export type HeadImage = {
  url: string;
  width: number;
  height: number;
  type: string;
};

/** The largest variant of an image, by its public blob URL */
export function toHeadImage(
  imageSet: v2.ImageSet | undefined,
): HeadImage | null {
  const variants = (imageSet?.images ?? []).filter(
    (image) => image.blob?.digest,
  );
  const largest = variants.sort((a, b) => b.width - a.width).at(0);
  const digest = largest?.blob?.digest;
  if (!largest?.blob || !digest) return null;

  return {
    url: `${DEFAULT_SERVER}/blob/${digest.type}_${bytesToHex(digest.value)}`,
    width: largest.width,
    height: largest.height,
    type: largest.blob.mimeType,
  };
}

/** The bundle of `kind` at the URL's key fingerprint and sequence */
export function findByKey<K extends ContentKind>(
  bundles: v2.EventBundle[],
  kind: K,
  keyFingerprint: string,
  sequence: bigint,
) {
  for (const bundle of bundles) {
    const decoded = decodeBundle(bundle, kind);
    const key = decoded?.event.key;
    if (
      key?.sequence === sequence &&
      getKeyFingerprint(key.signedBy) === keyFingerprint
    ) {
      return decoded;
    }
  }
  return null;
}

/** Whether any of the label values marks content for a warning */
export function hasModerationLabelValue(labelValues: string[]): boolean {
  return labelValues.some((label) =>
    (MODERATION_LABELS as string[]).includes(label),
  );
}

/** Labels events arrive as hints next to the content they label */
export function hasModerationLabel(
  eventHints: v2.EventHint[],
  ownLabels: string[] = [],
): boolean {
  const hinted = eventHints.flatMap((hint) =>
    hint.eventBundle
      ? (decodeBundle(hint.eventBundle, 'labels')?.content.labelValues ?? [])
      : [],
  );

  return hasModerationLabelValue([...hinted, ...ownLabels]);
}
