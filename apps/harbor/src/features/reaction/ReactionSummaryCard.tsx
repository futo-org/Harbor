import { EmojiImage } from '@/src/common/components/EmojiImage';
import { Text } from '@/src/common/components/primitives/Text';
import {
  type PostData,
  usePolycentric,
  useUsername,
} from '@/src/common/lib/polycentric-hooks';
import {
  Atoms,
  createThemedStyles,
  Spacing,
  useTheme,
} from '@/src/common/theme';
import { useId, useMemo } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { ReactionGroup } from './usePostReactions';
import {
  countReactionsFrom,
  type ReactionSummaryLine,
  summarizeReactions,
} from './util';

const MAX_LINES = 4;
// Emojis of the lines past MAX_LINES shown in the last line.
const MAX_MORE_EMOJIS = 4;
const MAX_CARD_WIDTH = 280;
const EMOJI_SIZE = 16;

/** Condensed list of who reacted to `post` with which emoji. */
export function ReactionSummaryCard({
  post,
  groups,
}: {
  post: PostData;
  groups: Map<string, ReactionGroup>;
}) {
  const client = usePolycentric();
  const styles = useStyles();
  const { theme } = useTheme();
  const myIdentity = client.activeIdentityKey ?? undefined;

  const { lines, moreEmojis, morePeopleCount } = useMemo(
    () =>
      summarizeReactions(
        groups,
        countReactionsFrom(post),
        myIdentity,
        MAX_LINES,
      ),
    [groups, post, myIdentity],
  );

  return (
    <View style={styles.card}>
      {lines.map((line) => (
        <SummaryLine key={line.emoji} line={line} />
      ))}
      {moreEmojis.length > 0 ? (
        <View style={styles.line}>
          <View style={styles.moreEmojis}>
            {moreEmojis.slice(0, MAX_MORE_EMOJIS).map((emoji) => (
              <EmojiImage key={emoji} sequence={emoji} size={EMOJI_SIZE} />
            ))}
            {/* Past the cap, the last two emojis fade out to hint at more. */}
            {moreEmojis.length > MAX_MORE_EMOJIS ? (
              <EmojiFade
                color={theme.colors.box.secondary.bg}
                style={styles.moreEmojisFade}
              />
            ) : null}
          </View>
          <Text variant="small" color="muted">
            {morePeopleCount} more {morePeopleCount === 1 ? 'person' : 'people'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function SummaryLine({ line }: { line: ReactionSummaryLine }) {
  const { emoji, includesMe, identity, othersCount } = line;
  const styles = useStyles();

  return (
    <View style={styles.line}>
      <EmojiImage sequence={emoji} size={EMOJI_SIZE} />
      {/* Only the name shrinks, so "You" and "and N others" always show. */}
      <View style={styles.names}>
        {includesMe ? (
          <Text variant="small" color="secondary" style={styles.fixed}>
            You
          </Text>
        ) : null}
        {includesMe && identity !== undefined ? (
          <Text variant="small" color="secondary" style={styles.fixed}>
            {othersCount > 0 ? ', ' : ' and '}
          </Text>
        ) : null}
        {identity !== undefined ? (
          <Text
            variant="small"
            color="secondary"
            numberOfLines={1}
            style={styles.name}
          >
            <ReactorName identity={identity} />
          </Text>
        ) : null}
        {othersCount > 0 ? (
          <Text variant="small" color="secondary" style={styles.fixed}>
            {includesMe || identity !== undefined
              ? ` and ${othersCount} ${othersCount === 1 ? 'other' : 'others'}`
              : `${othersCount} ${othersCount === 1 ? 'person' : 'people'}`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ReactorName({ identity }: { identity: string }) {
  return useUsername(identity);
}

/** Fades what's under it out into `color`, left to right. */
function EmojiFade({
  color,
  style,
}: {
  color: string;
  style: StyleProp<ViewStyle>;
}) {
  // SVG ids need to be document-global on web, so keep them unique per instance.
  const gradientId = `emoji-fade-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <View style={style}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset="1" stopColor={color} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}

const useStyles = createThemedStyles((theme, define) =>
  define({
    card: [
      Atoms.px_md,
      Atoms.py_sm,
      Atoms.gap_xs,
      Atoms.rounded_md,
      Atoms.border,
      theme.atoms.box.secondary.bg,
      theme.atoms.box.secondary.border,
      { maxWidth: MAX_CARD_WIDTH },
    ],
    line: [Atoms.flex_row, Atoms.items_center, Atoms.gap_sm],
    moreEmojis: [Atoms.flex_row, Atoms.gap_2xs],
    moreEmojisFade: [
      Atoms.absolute,
      {
        top: 0,
        bottom: 0,
        right: 0,
        // Covers the last two emojis and the gap between them.
        width: 2 * EMOJI_SIZE + Spacing['2xs'],
      },
    ],
    names: [Atoms.flex_row, Atoms.flex_shrink_1],
    name: Atoms.flex_shrink_1,
    fixed: Atoms.flex_shrink_0,
  }),
);
