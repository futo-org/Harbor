import { Text } from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import {
  hexToBytes,
  thirdPartyApplication,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { Atoms } from '@/src/common/theme';
import { Username } from '@/src/features/profile/Username';
import { useProfileModeration } from '@/src/features/profile/hooks/useProfileModeration';
import { v2 } from '@polycentric/react-native';
import { type ExternalPathString, Link, router } from 'expo-router';
import { memo, useCallback, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import type { PostLabel } from '@/src/common/lib/polycentric-hooks/helpers';
import { LabelPill } from '@/src/features/moderation/LabelPill';
import { PostImages } from '../PostImages';
import { PostText } from '../PostText';
import { LinkPreviewCard } from './LinkPreviewCard';
import { PostContentQuote } from './PostContentQuote';

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
  const replyParentId = hideReplyingTo ? undefined : post.reply?.parentId;
  const withApp = thirdPartyApplication(post.application);
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
      {replyParentId || withApp ? (
        <View
          style={[
            Atoms.flex_row,
            Atoms.align_center,
            Atoms.max_w_full,
            Atoms.mr_3xl,
          ]}
        >
          {replyParentId ? (
            <ReplyingToSubheader parentId={replyParentId} />
          ) : null}
          {withApp ? (
            <ApplicationSubheader
              {...withApp}
              prefix={replyParentId ? ' with ' : 'Posted with '}
            />
          ) : null}
        </View>
      ) : null}

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

function ApplicationSubheader({
  prefix,
  name,
  url,
}: {
  prefix: string;
  name: string;
  url?: string;
}) {
  const label = (
    <Text variant="secondary" color="neutral_500" fontWeight="regular">
      {name}
    </Text>
  );

  return (
    <View style={[Atoms.flex_row, Atoms.align_center, Atoms.flex_shrink_0]}>
      <Text variant="secondary" color="neutral_500" fontWeight="regular">
        {prefix}
      </Text>
      {url ? (
        <Link
          className="underlineOnHover"
          href={url as ExternalPathString}
          target="_blank"
        >
          {label}
        </Link>
      ) : (
        label
      )}
    </View>
  );
}

function ReplyingToSubheader({ parentId }: { parentId: string }) {
  const parentIdentity = useMemo(() => {
    try {
      return v2.EventKey.fromBinary(hexToBytes(parentId)).identity;
    } catch {
      return null;
    }
  }, [parentId]);

  const handlePress = useCallback(() => {
    if (!parentIdentity) return;
    router.navigate(Routes.tabs.profile(parentIdentity));
  }, [parentIdentity]);
  const { obscured } = useProfileModeration(parentIdentity);

  if (!parentIdentity) return null;

  return (
    <Pressable
      onPress={handlePress}
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.self_start,
        Atoms.flex_shrink_1,
        Atoms.max_w_full,
      ]}
    >
      <Text
        variant="secondary"
        color="neutral_500"
        fontWeight="regular"
        style={Atoms.flex_shrink_0}
      >
        Replying to{' '}
      </Text>
      {obscured ? (
        // No room for the label pill here; the id stands in for the name.
        <Text
          variant="secondary"
          color="primary_500"
          monospace
          numberOfLines={1}
          style={Atoms.flex_shrink_1}
        >
          {parentIdentity}
        </Text>
      ) : (
        <Username
          identity={parentIdentity}
          variant="secondary"
          color="primary_500"
        />
      )}
    </Pressable>
  );
}
