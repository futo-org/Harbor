import { Text } from '@/src/common/components';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import ReactionDetailsSheet from '@/src/features/reaction/ReactionDetailsSheet';
import { previewOtherReactions } from '@/src/features/reaction/util';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import useReactions from '../../reaction/useReactions';

/** Max number of stacked emojis shown in the expanded output. */
const MAX_STACKED = 3;

type PostReactionOutputProps = {
  post: PostData;
};

export default function PostReactionOutput({ post }: PostReactionOutputProps) {
  const { theme } = useTheme();

  const myReaction = useReactions((s) => s.reactions.get(post.id));
  const myEmoji =
    myReaction?.positive && myReaction.emoji ? myReaction.emoji : undefined;

  const others = useMemo(
    () => previewOtherReactions(post, myEmoji, MAX_STACKED),
    [post, myEmoji],
  );

  // Reaction details sheet state
  const [open, setOpen] = useState(false);

  const hasReactions = others.length > 0 || myEmoji !== undefined;

  // Display a button with a preview of the reactions if there is at least
  // one reaction to show
  const previewButton = hasReactions ? (
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
      {/** Render our own emoji on top with full opacity, if present: */}
      {myEmoji ? (
        <View style={{ zIndex: 2 }}>
          <Text style={{ fontSize: 14 }}>{myEmoji}</Text>
        </View>
      ) : null}
      {others.length > 0 ? (
        /** Render other reactions dimmed, behind our own: */
        <View
          needsOffscreenAlphaCompositing
          style={[
            Atoms.flex_row,
            Atoms.align_center,
            { zIndex: 1, opacity: 0.65 },
            /** Tuck under our reaction if we have one: */
            myEmoji && { marginLeft: -6 },
          ]}
        >
          {others.map((emoji, i) => (
            <View
              key={emoji}
              style={[
                { zIndex: others.length - i },
                i > 0 && { marginLeft: -6 },
              ]}
            >
              <Text style={{ fontSize: 14 }}>{emoji}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  ) : null;

  return (
    <>
      {previewButton}
      {/* Render this sheet even if there are no reactions in case the user was
          viewing it when the last remaining reaction was deleted. */}
      <ReactionDetailsSheet
        post={post}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
