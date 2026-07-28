import HoverCard, { type TriggerRef } from '@/src/common/components/HoverCard';
import {
  type PostData,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { memo, useRef, useState } from 'react';
import { type GestureResponderEvent, View } from 'react-native';
import { DEFAULT_REACTION_EMOJI } from '../../reaction/consts';
import EmojiPickerInline from '../../reaction/EmojiPickerInline';
import useReactions from '../../reaction/useReactions';
import PostActionButton from './PostActionButton';

type PostReactionButtonProps = {
  post: PostData;
};

function PostReactionButton({ post }: PostReactionButtonProps) {
  const client = usePolycentric();

  const triggerRef = useRef<TriggerRef>(null);

  const reaction = useReactions((s) => s.reactions.get(post.id));
  const count = post.upvoteCount;
  const addReaction = useReactions((s) => s.addReaction);
  const removeReaction = useReactions((s) => s.removeReaction);
  const changeReaction = useReactions((s) => s.changeReaction);

  const [open, setOpen] = useState(false);
  const hasReaction = !!reaction;

  const onEmojiSelect = (emoji: string) => {
    triggerRef.current?.close();
    if (hasReaction && reaction.emoji === emoji) {
      // Reselecting the same emoji clears it.
      removeReaction(client, post);
    } else if (hasReaction) {
      changeReaction(client, post, { emoji, positive: true });
    } else {
      addReaction(client, post, { emoji, positive: true });
    }
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
