import {
  IdentityTag,
  ProfileAvatar,
  Text,
} from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { timeAgo, type PostData } from '@/src/common/lib/polycentric-hooks';
import { mentionsToPlainText } from '@/src/common/util/parseTextLinks';
import {
  getKeyFingerprint,
  hexToBytes,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { Block, useShimmerOpacity } from '@/src/common/components/skeletons';
import { Atoms, Spacing, useTheme, withHexOpacity } from '@/src/common/theme';
import { Username } from '@/src/features/profile/Username';
import { FetchMode, v2 } from '@polycentric/react-native';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { usePostById } from '../hooks/usePostById';
import { usePostModeration } from '../hooks/usePostModeration';
import { PostImages } from '../PostImages';
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

  const handlePress = useCallback(() => {
    if (!post) return;

    const keyFingerprint = getKeyFingerprint(post.signedBy);
    if (!keyFingerprint) return;

    router.push(Routes.tabs.post(post.identity, keyFingerprint, post.sequence));
  }, [post]);

  if (!post) return isLoading ? <QuoteSkeleton /> : <QuoteUnavailable />;

  return (
    <Pressable
      onPress={handlePress}
      style={[
        Atoms.p_md,
        Atoms.rounded_md,
        Atoms.mt_sm,
        {
          borderWidth: 1,
          borderColor: withHexOpacity(theme.palette.neutral_500, '30'),
        },
      ]}
    >
      <AuthorRow post={post} />
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
        {
          borderWidth: 1,
          borderColor: withHexOpacity(theme.palette.neutral_500, '30'),
        },
      ]}
    >
      <View style={[Atoms.justify_center, { height: PLACEHOLDER_HEIGHT }]}>
        <Text variant="secondary" color="neutral_500">
          This post is unavailable.
        </Text>
      </View>
    </View>
  );
}

/** Author and time info at the top. */
function AuthorRow({ post }: { post: PostData }) {
  const time = timeAgo(Number(post.createdAt));

  return (
    <View style={[Atoms.flex_row, Atoms.gap_xs, Atoms.align_center]}>
      <ProfileAvatar
        identityKey={post.identity}
        size="xs"
        style={Atoms.mr_md}
      />
      <Username
        identity={post.identity}
        variant="secondary"
        fontWeight="bold"
      />
      <IdentityTag identity={post.identity} />
      {time ? (
        <>
          <Text variant="secondary" color="neutral_500" fontWeight="bold">
            ·
          </Text>
          <Text
            variant="secondary"
            color="neutral_500"
            style={Atoms.flex_shrink_0}
          >
            {time}
          </Text>
        </>
      ) : null}
    </View>
  );
}

/** A preview of the post's content. */
function PostBody({ post }: { post: PostData }) {
  const { theme } = useTheme();

  const content = mentionsToPlainText(post.content ?? '');
  const preview =
    content.length > QUOTE_PREVIEW_LIMIT
      ? `${content.slice(0, QUOTE_PREVIEW_LIMIT)}…`
      : content;

  return (
    <>
      {preview ? (
        <Text
          variant="secondary"
          numberOfLines={4}
          style={[Atoms.mt_xs, theme.atoms.text_neutral_high]}
        >
          {preview}
        </Text>
      ) : null}
      {post.images?.length > 0 ? (
        <View style={Atoms.mt_xs}>
          <PostImages post={post} />
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
        {
          borderWidth: 1,
          borderColor: withHexOpacity(theme.palette.neutral_500, '30'),
        },
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
