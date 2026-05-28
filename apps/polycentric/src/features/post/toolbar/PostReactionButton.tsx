import HoverCard, { TriggerRef } from '@/src/common/components/HoverCard';
import { PostData, usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { memo, useRef, useState } from 'react';
import { GestureResponderEvent, View } from 'react-native';
import { DEFAULT_REACTION_EMOJI } from '../../reaction/consts';
import EmojiPickerInline from '../../reaction/EmojiPickerInline';
import useReactions from '../../reaction/useReactions';
import PostActionButton from './PostActionButton';
import { isWeb } from '@/src/common/util/platform';

type PostReactionButtonProps = {
  post: PostData;
};

function PostReactionButton({ post }: PostReactionButtonProps) {
  const client = usePolycentric();

  const triggerRef = useRef<TriggerRef>(null);

  const reaction = useReactions((s) => s.reactions.get(post.id));
  const count = useReactions((s) => {
    const counts = s.reactionCounts.get(post.id);
    if (!counts) return 0;
    let total = 0;
    for (const v of Object.values(counts)) total += v;
    return total;
  });
  const addReaction = useReactions((s) => s.addReaction);
  const removeReaction = useReactions((s) => s.removeReaction);

  const [open, setOpen] = useState(false);
  const hasReaction = !!reaction;

  // Toggle: re-selecting the same emoji clears it
  const onEmojiSelect = async (emoji: string) => {
    triggerRef.current?.close();
    if (hasReaction) {
      await removeReaction(client, post.id);

      if (reaction.emoji === emoji) return; // Same emoji means we removed it
    }

    addReaction(client, { targetId: post.id, emoji, positive: true });
  };

  const onReactionPress = (e: GestureResponderEvent) => {
    e.preventDefault();
    onEmojiSelect(reaction?.emoji ?? DEFAULT_REACTION_EMOJI);
  };

  return (
    <View style={[]}>
      <HoverCard openDelay={0} onOpenChange={setOpen}>
        <HoverCard.Trigger
          asChild
          ref={triggerRef}
          onPress={onReactionPress}
          onLongPress={triggerRef.current?.open}
        >
          <PostActionButton
            icon={hasReaction ? 'reaction' : 'reactionOutline'}
            active={hasReaction}
            highlighted={open}
            color={'negative_500'}
            count={count}
          />
        </HoverCard.Trigger>
        <HoverCard.Content align="start" side="top">
          <EmojiPickerInline
            selectedEmoji={reaction?.emoji}
            onSelect={onEmojiSelect}
          />
        </HoverCard.Content>
      </HoverCard>
    </View>
  );
}

export default memo(PostReactionButton);
