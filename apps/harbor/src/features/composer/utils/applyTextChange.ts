// An inserted mention: `[start, end)` of the composer text holds `@` + what
// it renders as (alias or display name)
export type MentionRange = { start: number; end: number; identity: string };

/**
 * Apply the input's change from `prevText` to `nextText` to the mention
 * ranges. Mentions are atomic: an edit reaching inside one deletes or
 * replaces all of it, so the returned `text` differs from `nextText` exactly
 * when that happened. `caret` is where the edit ends in `text`.
 */
export function applyTextChange(
  prevText: string,
  nextText: string,
  mentionRanges: MentionRange[],
): { text: string; mentionRanges: MentionRange[]; caret: number } {
  // A diff can't tell where in a run of repeated chars an edit happened
  // (an `@` typed before `@ann`): prefer the placement that spares a mention.
  const overlapsAnyRange = (edit: { from: number; to: number }) =>
    mentionRanges.some((r) => overlapsRange(edit, r));
  let edit = findEdit(prevText, nextText, true);
  if (overlapsAnyRange(edit)) {
    const suffixFirstEdit = findEdit(prevText, nextText, false);
    if (!overlapsAnyRange(suffixFirstEdit)) edit = suffixFirstEdit;
  }
  let { from, to } = edit;
  const { inserted } = edit;

  // Ranges never overlap each other, so one pass covers them all.
  for (const r of mentionRanges) {
    if (overlapsRange({ from, to }, r)) {
      from = Math.min(from, r.start);
      to = Math.max(to, r.end);
    }
  }

  const shift = inserted.length - (to - from);
  return {
    text: prevText.slice(0, from) + inserted + prevText.slice(to),
    mentionRanges: mentionRanges
      .filter((r) => r.end <= from || r.start >= to)
      .map((r) =>
        r.start >= to
          ? { ...r, start: r.start + shift, end: r.end + shift }
          : r,
      ),
    caret: from + inserted.length,
  };
}

// The single splice turning `prevText` into `nextText`: `[from, to)` of
// `prevText` replaced with `inserted`. Matching the common prefix first puts
// an ambiguous edit as far right as possible, the suffix first as far left.
function findEdit(prevText: string, nextText: string, prefixFirst: boolean) {
  const maxCommon = Math.min(prevText.length, nextText.length);
  let prefix = 0;
  let suffix = 0;
  const matchPrefix = () => {
    while (
      prefix + suffix < maxCommon &&
      prevText[prefix] === nextText[prefix]
    ) {
      prefix++;
    }
  };
  const matchSuffix = () => {
    while (
      prefix + suffix < maxCommon &&
      prevText[prevText.length - 1 - suffix] ===
        nextText[nextText.length - 1 - suffix]
    ) {
      suffix++;
    }
  };
  if (prefixFirst) {
    matchPrefix();
    matchSuffix();
  } else {
    matchSuffix();
    matchPrefix();
  }
  return {
    from: prefix,
    to: prevText.length - suffix,
    inserted: nextText.slice(prefix, nextText.length - suffix),
  };
}

// Whether the edit reaches inside the range. Touching its edges doesn't: an
// insertion at `start` or `end`, or a deletion ending at `start`.
function overlapsRange(
  edit: { from: number; to: number },
  range: MentionRange,
) {
  return edit.from < range.end && edit.to > range.start;
}
