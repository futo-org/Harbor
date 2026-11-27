import { EmojiImage } from '@/src/common/components/EmojiImage';
import HoverCard, { type TriggerRef } from '@/src/common/components/HoverCard';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { useTutorialHintsStore } from '@/src/common/lib/useTutorialHintsStore';
import { hasPointerHover } from '@/src/common/util/platform';
import ReactionDetailsSheet from '@/src/features/reaction/ReactionDetailsSheet';
import { ReactionSummaryCard } from '@/src/features/reaction/ReactionSummaryCard';
import usePostReactions from '@/src/features/reaction/usePostReactions';
import { previewOtherReactions } from '@/src/features/reaction/util';
import { FetchMode } from '@polycentric/react-native-sdk';
import { useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import useReactions from '../../reaction/useReactions';

/** Max number of stacked emojis, and of emoji lines in the summary card. */
const MAX_STACKED = 4;

const EMOJI_SIZE = 18;

// Opening the summary fetches the reactions, so a cursor passing over the
// feed shouldn't open it.
const SUMMARY_OPEN_DELAY_MS = 200;

type PostReactionOutputProps = {
  post: PostData;
};

export default function PostReactionOutput({ post }: PostReactionOutputProps) {
  const myReaction = useReactions((s) => s.reactions.get(post.id));
  const myEmoji =
    myReaction?.positive && myReaction.emoji ? myReaction.emoji : undefined;

  const others = useMemo(
    () => previewOtherReactions(post, myEmoji, MAX_STACKED),
    [post, myEmoji],
  );

  const dismissHint = useTutorialHintsStore((state) => state.dismissHint);

  // Reaction details sheet state
  const [open, setOpen] = useState(false);
  const summaryTriggerRef = useRef<TriggerRef>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  // Cached reactions are enough for the summary, so a repeat hover sends no
  // request. Opening the sheet refreshes them. Closed, the query stops but
  // still returns the cached reactions, which the card shows while fading out.
  const summaryReactions = usePostReactions(post, {
    fetchMode: FetchMode.OfflineFirst,
    enabled: summaryOpen,
  });

  const hasReactions = others.length > 0 || myEmoji !== undefined;

  // Display a button with a preview of the reactions if there is at least
  // one reaction to show
  const previewButton = hasReactions ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="View reactions"
      onPress={() => {
        summaryTriggerRef.current?.close();
        dismissHint('openReactionDetails');
        setOpen(true);
      }}
      style={({ pressed, hovered }) => [
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.rounded_full,
        Atoms.cursor_pointer,
        hovered && Atoms.faded_subtle,
        pressed && Atoms.faded,
      ]}
      hitSlop={16}
    >
      {/** Render our own emoji on top with full opacity, if present: */}
      {myEmoji ? (
        <View style={{ zIndex: 2 }}>
          <EmojiImage sequence={myEmoji} size={EMOJI_SIZE} />
        </View>
      ) : null}
      {others.length > 0 ? (
        /** Render other reactions dimmed, behind our own: */
        <View
          needsOffscreenAlphaCompositing
          style={[
            Atoms.flex_row,
            Atoms.align_center,
            { zIndex: 1 },
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
              <EmojiImage sequence={emoji} size={EMOJI_SIZE} />
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  ) : null;

  return (
    <>
      {previewButton && hasPointerHover ? (
        <HoverCard
          openDelay={SUMMARY_OPEN_DELAY_MS}
          onOpenChange={setSummaryOpen}
        >
          <HoverCard.Trigger asChild ref={summaryTriggerRef}>
            {previewButton}
          </HoverCard.Trigger>
          <HoverCard.Content
            side="top"
            align="end"
            ready={!summaryReactions.isLoading && !summaryReactions.isError}
          >
            <ReactionSummaryCard
              post={post}
              groups={summaryReactions.groups}
              maxLines={MAX_STACKED}
            />
          </HoverCard.Content>
        </HoverCard>
      ) : (
        previewButton
      )}
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
