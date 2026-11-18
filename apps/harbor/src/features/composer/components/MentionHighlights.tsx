import { Text as RNText } from 'react-native';
import { useTheme } from '@/src/common/theme';
import type { MentionRange } from '../utils/applyTextChange';
import { splitByMentionRanges } from '../utils/splitByMentionRanges';

/**
 * The composer text with its mentions colored: the input's children on native,
 * the mirror over the textarea on web.
 */
export function MentionHighlights({
  text,
  mentionRanges,
}: {
  text: string;
  mentionRanges: MentionRange[];
}) {
  const { theme } = useTheme();
  return splitByMentionRanges(text, mentionRanges).map((segment, i) => (
    // RN Text, not the primitive: a piece must inherit the input's font and
    // differ from it in color only, or the iOS input restyles typed text and
    // the web caret drifts off the mirror
    <RNText
      // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional, derived from the text
      key={i}
      style={segment.isMention && theme.atoms.accent}
    >
      {segment.text}
    </RNText>
  ));
}
