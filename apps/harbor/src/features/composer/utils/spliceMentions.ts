import type { MentionRange } from '@/src/features/composer/utils/applyTextChange';

// Replace each inserted `@renderAs` mention in text with `@{identity,renderAs}`
export function spliceMentions(
  text: string,
  mentionRanges: MentionRange[],
): string {
  // Splice from the end so earlier offsets stay valid.
  return [...mentionRanges]
    .sort((a, b) => b.start - a.start)
    .reduce(
      (result, r) =>
        `${result.slice(0, r.start)}@{${r.identity},${result.slice(r.start + 1, r.end)}}${result.slice(r.end)}`,
      text,
    );
}
