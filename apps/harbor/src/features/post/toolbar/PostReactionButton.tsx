import HoverCard, { type TriggerRef } from '@/src/common/components/HoverCard';
import {
  type PostData,
  useCurrentIdentity,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { memo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useEmojiPickerStore } from '../../reaction/useEmojiPickerStore';
import EmojiPickerInline from '../../reaction/EmojiPickerInline';
import useReactions from '../../reaction/useReactions';
import PostActionButton from './PostActionButton';

type PostReactionButtonProps = {
  post: PostData;
};

function PostReactionButton({ post }: PostReactionButtonProps) {
  const client = usePolycentric();
  const { hasIdentity } = useCurrentIdentity();

  const triggerRef = useRef<TriggerRef>(null);

  const reaction = useReactions((s) => s.reactions.get(post.id));
  const count = post.upvoteCount;
  const toggleReaction = useReactions((s) => s.toggleReaction);
  const openEmojiPicker = useEmojiPickerStore((s) => s.openFor);

  const [open, setOpen] = useState(false);
  const hasReaction = !!reaction;

  const onEmojiSelect = (emoji: string) => {
    triggerRef.current?.close();
    toggleReaction(client, post, emoji);
  };

  const onShowMore = () => {
    triggerRef.current?.close();
    openEmojiPicker(post);
  };

  const button = (
    <PostActionButton
      icon={hasReaction ? 'reaction' : 'reactionOutline'}
      emoji={reaction?.positive ? reaction.emoji : undefined}
      active={hasReaction}
      highlighted={open}
      count={count}
    />
  );

  // (Signed out)
  if (!hasIdentity) return <View>{button}</View>;

  return (
    <View style={[]}>
      <HoverCard openDelay={0} onOpenChange={setOpen}>
        <HoverCard.Trigger asChild ref={triggerRef}>
          {button}
        </HoverCard.Trigger>
        <HoverCard.Content align="start" side="top">
          <EmojiPickerInline
            selectedEmoji={reaction?.emoji}
            onSelect={onEmojiSelect}
            onShowMore={onShowMore}
          />
        </HoverCard.Content>
      </HoverCard>
    </View>
  );
}

export default memo(PostReactionButton);
