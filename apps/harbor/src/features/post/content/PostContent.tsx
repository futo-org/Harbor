import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { memo } from 'react';
import { View } from 'react-native';
import type { PostLabel } from '@/src/common/lib/polycentric-hooks/helpers';
import { LabelPill } from '@/src/features/moderation/LabelPill';
import { PostImages } from '../PostImages';
import { PostText } from '../PostText';
import { LinkPreviewCard } from './LinkPreviewCard';
import { PostContentQuote } from './PostContentQuote';
import { PostSubheader } from './PostSubheader';

/** A post's body: what it is replying to, its text, and its attachments. */
export const PostContent = memo(function PostContent({
  post,
  hideReplyingTo,
  compactLinkPreview,
  focusedView = false,
  labelPill,
}: {
  post: PostData;
  hideReplyingTo: boolean;
  compactLinkPreview: boolean;
  /** Focused-post rendering: larger, selectable text. */
  focusedView?: boolean;
  /** The post's labels, with `onHide` once revealed. */
  labelPill?: { labels: PostLabel[]; onHide?: () => void };
}) {
  // Inline after the text, or after the attachments when there is none.
  const pill =
    labelPill && labelPill.labels.length > 0 ? (
      <LabelPill
        labels={labelPill.labels}
        action={labelPill.onHide ? 'Hide' : undefined}
        onPress={labelPill.onHide}
        inline={!!post.content}
      />
    ) : null;

  return (
    <View style={Atoms.gap_2xs}>
      <PostSubheader post={post} hideReplyingTo={hideReplyingTo} />

      {post.content ? (
        <PostText
          content={post.content}
          expandable={!focusedView}
          large={focusedView}
          selectable={focusedView}
          trailing={pill}
        />
      ) : null}
      {/* Render only the first link preview. A post may carry multiple
        `links` (e.g. from another client), but we cap the UI at one. */}
      {post.links?.[0] ? (
        <LinkPreviewCard link={post.links[0]} compact={compactLinkPreview} />
      ) : null}
      {post.images?.length > 0 && <PostImages post={post} />}
      {post.quoteId ? (
        <PostContentQuote quoteId={post.quoteId} quotePost={post.quotePost} />
      ) : null}
      {post.content ? null : pill}
    </View>
  );
});
