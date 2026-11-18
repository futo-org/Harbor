import { EmojiImage } from '@/src/common/components/EmojiImage';
import { Text } from '@/src/common/components/primitives/Text';
import { useIsTutorialHintShown } from '@/src/common/lib/useTutorialHintsStore';
import {
  type PostData,
  usePolycentric,
  useUsername,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, createThemedStyles } from '@/src/common/theme';
import { useMemo } from 'react';
import { View } from 'react-native';
import type { ReactionGroup } from './usePostReactions';
import {
  countReactionsFrom,
  type ReactionSummaryLine,
  summarizeReactions,
} from './util';

const MAX_CARD_WIDTH = 280;
const EMOJI_SIZE = 16;

/** Condensed list of who reacted to `post` with which emoji. */
export function ReactionSummaryCard({
  post,
  groups,
  maxLines,
}: {
  post: PostData;
  groups: Map<string, ReactionGroup>;
  maxLines: number;
}) {
  const client = usePolycentric();
  const styles = useStyles();
  const myIdentity = client.activeIdentityKey ?? undefined;

  const { lines, morePeopleCount } = useMemo(
    () =>
      summarizeReactions(
        groups,
        countReactionsFrom(post),
        myIdentity,
        maxLines,
      ),
    [groups, post, myIdentity, maxLines],
  );

  // Shown until the user first opens the reaction details from the footer.
  const isHintShown = useIsTutorialHintShown('openReactionDetails');
  const moreText =
    morePeopleCount > 0 &&
    `+${morePeopleCount} more ${morePeopleCount === 1 ? 'reaction' : 'reactions'}`;

  return (
    <View style={styles.card}>
      {lines.map((line) => (
        <SummaryLine key={line.emoji} line={line} />
      ))}
      {moreText || isHintShown ? (
        <Text variant="small" color="muted">
          {[moreText, isHintShown && 'Click to see all']
            .filter(Boolean)
            .join(' · ')}
        </Text>
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
    names: [Atoms.flex_row, Atoms.flex_shrink_1],
    name: Atoms.flex_shrink_1,
    fixed: Atoms.flex_shrink_0,
  }),
);
