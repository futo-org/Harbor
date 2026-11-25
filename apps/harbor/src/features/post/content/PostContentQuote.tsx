import { ImageGrid } from '@/src/common/components/composites';
import {
  InlineLink,
  ProfileAvatar,
  Text,
} from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { TimeAgo } from '@/src/common/components/TimeAgo';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { mentionsToPlainText } from '@/src/common/util/parseTextLinks';
import {
  getKeyFingerprint,
  hexToBytes,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { Block, useShimmerOpacity } from '@/src/common/components/skeletons';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { COLLECTION, FetchMode, v2 } from '@polycentric/react-native-sdk';
import { eventRoute } from '@/src/common/lib/navigation/eventRoute';
import { useCardLinkPress } from '@/src/common/lib/navigation/useCardLinkPress';
import { isWeb } from '@/src/common/util/platform';
import type { Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { usePostById } from '../hooks/usePostById';
import { usePostModeration } from '../hooks/usePostModeration';
import { PostAuthor } from '../PostAuthor';
import { openPostImage } from '../PostImageViewerScreen';
import { PostWarnOverlay } from '../PostWarnOverlay';

const QUOTE_PREVIEW_LIMIT = 200;
const PLACEHOLDER_HEADER_HEIGHT = 24;
const PLACEHOLDER_LINE_HEIGHT = 12;
const PLACEHOLDER_HEIGHT =
  PLACEHOLDER_HEADER_HEIGHT + Spacing.xs + PLACEHOLDER_LINE_HEIGHT;

/** Embedded preview of a quoted post. Rendered inside a parent Post
 *  when its `quoteId` is set. Tapping routes to the quoted post. */
export function PostContentQuote({
  quoteId,
  quotePost,
}: {
  quoteId: string;
  /** Quoted post already resolved from the feed's `event_hints`;
   *  when set the fetch is skipped and the box renders immediately. */
  quotePost?: PostData;
}) {
  const { theme } = useTheme();

  const eventKey = useMemo(() => {
    try {
      return v2.EventKey.fromBinary(hexToBytes(quoteId));
    } catch {
      return null;
    }
  }, [quoteId]);

  const fetched = usePostById(
    quotePost ? undefined : eventKey?.identity,
    getKeyFingerprint(eventKey?.signedBy),
    eventKey?.sequence,
    { fetchMode: FetchMode.OfflineFirst },
  );
  const post = quotePost ?? fetched.post;
  const isLoading = !quotePost && fetched.isLoading;

  const { hasWarnContent, warnLabels } = usePostModeration(post?.labels);
  const [warnDismissed, setWarnDismissed] = useState(false);
  const handleWarnDismiss = useCallback(() => setWarnDismissed(true), []);

  const postRoute = post
    ? eventRoute({ ...post, collection: COLLECTION.FEED })
    : null;
  const cardLinkProps = useCardLinkPress(postRoute);

  if (!post) return isLoading ? <QuoteSkeleton /> : <QuoteUnavailable />;

  return (
    <Pressable
      {...cardLinkProps}
      style={[
        Atoms.p_md,
        Atoms.rounded_md,
        Atoms.mt_sm,
        theme.atoms.outline,
        Atoms.border,
      ]}
    >
      <AuthorRow post={post} postRoute={postRoute} />
      {hasWarnContent && !warnDismissed ? (
        <PostWarnOverlay
          labels={warnLabels}
          authorIdentity={post.identity}
          onDismiss={handleWarnDismiss}
        />
      ) : (
        <PostBody post={post} />
      )}
    </Pressable>
  );
}

function QuoteUnavailable() {
  const { theme } = useTheme();
  return (
    <View
      style={[
        Atoms.p_md,
        Atoms.rounded_md,
        Atoms.mt_sm,
        theme.atoms.outline,
        Atoms.border,
      ]}
    >
      <View style={[Atoms.justify_center, { height: PLACEHOLDER_HEIGHT }]}>
        <Text variant="secondary" color="muted">
          This post is unavailable.
        </Text>
      </View>
    </View>
  );
}

/** Author and time info at the top. */
function AuthorRow({
  post,
  postRoute,
}: {
  post: PostData;
  postRoute: Href | null;
}) {
  return (
    <View style={[Atoms.flex_row, Atoms.gap_xs, Atoms.align_center]}>
      <ProfileAvatar
        identityKey={post.identity}
        size="xs"
        linkToProfile
        style={Atoms.mr_md}
      />
      <PostAuthor identity={post.identity} />
      {post.createdAt ? (
        <>
          <Text variant="secondary" color="muted" fontWeight="bold">
            ·
          </Text>
          <Text variant="secondary" color="muted" style={Atoms.flex_shrink_0}>
            {/* Same target as the card: on native it would only take the
                card's press feedback. */}
            {isWeb && postRoute ? (
              <InlineLink href={postRoute}>
                <TimeAgo since={post.createdAt} />
              </InlineLink>
            ) : (
              <TimeAgo since={post.createdAt} />
            )}
          </Text>
        </>
      ) : null}
    </View>
  );
}

/** A preview of the post's content. */
function PostBody({ post }: { post: PostData }) {
  const openImage = useCallback(
    (index: number) => openPostImage(post, index),
    [post],
  );

  const content = mentionsToPlainText(post.content ?? '');
  const preview =
    content.length > QUOTE_PREVIEW_LIMIT
      ? `${content.slice(0, QUOTE_PREVIEW_LIMIT)}…`
      : content;

  return (
    <>
      {preview ? (
        <Text variant="secondary" numberOfLines={4} style={Atoms.mt_xs}>
          {preview}
        </Text>
      ) : null}
      {post.images?.length > 0 ? (
        <View style={Atoms.mt_xs}>
          <ImageGrid images={post.images} onOpenImage={openImage} />
        </View>
      ) : null}
    </>
  );
}

/** Mirrors the quote box's header-plus-line shape at a stable height. */
function QuoteSkeleton() {
  const { theme } = useTheme();
  const animatedStyle = useShimmerOpacity();
  return (
    <Animated.View
      style={[
        Atoms.p_md,
        Atoms.rounded_md,
        Atoms.mt_sm,
        animatedStyle,
        theme.atoms.outline,
        Atoms.border,
      ]}
    >
      <View style={[Atoms.flex_row, Atoms.gap_xs, Atoms.align_center]}>
        <Block
          width={PLACEHOLDER_HEADER_HEIGHT}
          height={PLACEHOLDER_HEADER_HEIGHT}
        />
        <Block width={120} height={PLACEHOLDER_LINE_HEIGHT} />
      </View>
      <View style={Atoms.mt_xs}>
        <Block width="90%" height={PLACEHOLDER_LINE_HEIGHT} />
      </View>
    </Animated.View>
  );
}
