import type { MentionRange } from './applyTextChange';

// Cut text into consecutive plain and mention segments, in text order
export function splitByMentionRanges(
  text: string,
  mentionRanges: MentionRange[],
): { text: string; isMention: boolean }[] {
  const segments: { text: string; isMention: boolean }[] = [];
  let plainStart = 0;
  // Ranges are kept in insertion order, not text order
  for (const r of [...mentionRanges].sort((a, b) => a.start - b.start)) {
    if (r.start > plainStart) {
      segments.push({
        text: text.slice(plainStart, r.start),
        isMention: false,
      });
    }
    segments.push({ text: text.slice(r.start, r.end), isMention: true });
    plainStart = r.end;
  }
  if (plainStart < text.length) {
    segments.push({ text: text.slice(plainStart), isMention: false });
  }
  return segments;
}
