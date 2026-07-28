import { Text } from '@/src/common/components';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import ReactionDetailsSheet from '@/src/features/reaction/ReactionDetailsSheet';
import {
  deriveDisplayReactions,
  type DisplayReaction,
} from '@/src/features/reaction/util';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import useReactions from '../../reaction/useReactions';

/** Max number of stacked emojis shown in the expanded output. */
const MAX_STACKED = 3;

type PostReactionOutputProps = {
  post: PostData;
};

/**
 * Derive the other users' reactions to display in the preview.
 */
function previewOthers(
  reactions: DisplayReaction[],
  mine: DisplayReaction | undefined,
): DisplayReaction[] {
  if (!mine) return reactions.slice(0, MAX_STACKED);
  return reactions.filter((r) => r !== mine).slice(0, MAX_STACKED - 1);
}

export default function PostReactionOutput({ post }: PostReactionOutputProps) {
  const { theme } = useTheme();
  const reaction = useReactions((s) => s.reactions.get(post.id));

  const displayReactions = useMemo(
    () => deriveDisplayReactions(post, reaction),
    [post, reaction],
  );
  const hasTallies = displayReactions.length > 0;

  const mine = displayReactions.find((r) => r.mine);
  const others = useMemo(
    () => previewOthers(displayReactions, mine),
    [displayReactions, mine],
  );

  const [open, setOpen] = useState(false);

  // Display only the user's reaction when we have no tallies to display.
  if (!hasTallies) {
    return (
      <View style={[Atoms.flex_row, Atoms.align_center, { opacity: 0.9 }]}>
        <Text style={{ fontSize: 12 }}>{reaction?.emoji}</Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View reactions"
        onPress={() => setOpen(true)}
        style={({ pressed, hovered }) => [
          Atoms.flex_row,
          Atoms.align_center,
          Atoms.rounded_full,
          Atoms.overflow_hidden,
          Atoms.cursor_pointer,
          Atoms.px_sm,
          Atoms.py_xs,
          {
            backgroundColor: withHexOpacity(
              theme.palette.neutral_500,
              hovered || pressed ? '28' : '14',
            ),
          },
        ]}
      >
        {mine ? (
          <View style={{ zIndex: 2 }}>
            <Text style={{ fontSize: 14 }}>{mine.emoji}</Text>
          </View>
        ) : null}
        {others.length > 0 ? (
          // Render the other users' reactions and dim them
          <View
            needsOffscreenAlphaCompositing
            style={[
              Atoms.flex_row,
              Atoms.align_center,
              { zIndex: 1, opacity: 0.65 },
              // Only overlap when there's a reaction of ours to tuck under.
              mine && { marginLeft: -6 },
            ]}
          >
            {others.map((item, i) => (
              <View
                key={item.emoji}
                style={[
                  { zIndex: others.length - i },
                  i > 0 && { marginLeft: -6 },
                ]}
              >
                <Text style={{ fontSize: 14 }}>{item.emoji}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Pressable>
      <ReactionDetailsSheet
        displayReactions={displayReactions}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
