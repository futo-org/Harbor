import {
  IdentityTag,
  ProfileAvatar,
  Text,
} from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { timeAgo, type PostData } from '@/src/common/lib/polycentric-hooks';
import {
  getKeyFingerprint,
  hexToBytes,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { Block, useShimmerOpacity } from '@/src/common/components/skeletons';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { v2 } from '@polycentric/react-native';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { usePostById } from '../hooks/usePostById';
import { PostImages } from '../PostImages';

const QUOTE_PREVIEW_LIMIT = 200;

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
  );
  const post = quotePost ?? fetched.post;
  const isLoading = !quotePost && fetched.isLoading;

  const authorProfile = useProfile(post?.identity ?? null);
  const authorName = authorProfile.name ?? '';

  const handlePress = useCallback(() => {
    if (!post) return;
    router.push(
      Routes.tabs.post(
        post.identity,
        getKeyFingerprint(post.signedBy)!,
        post.sequence,
      ),
    );
  }, [post]);

  if (!post) return isLoading ? <QuoteSkeleton /> : null;

  const content = post.content ?? '';
  const preview =
    content.length > QUOTE_PREVIEW_LIMIT
      ? `${content.slice(0, QUOTE_PREVIEW_LIMIT)}…`
      : content;
  const time = timeAgo(Number(post.createdAt));

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
      <View style={[Atoms.flex_row, Atoms.gap_xs, Atoms.align_center]}>
        <ProfileAvatar
          identityKey={post.identity}
          size="xs"
          style={Atoms.mr_md}
        />
        <Text
          variant="secondary"
          fontWeight="bold"
          numberOfLines={1}
          style={Atoms.flex_shrink_1}
        >
          {authorName || '…'}
        </Text>
        <IdentityTag identity={post.identity} />
        {time ? (
          <>
            <Text variant="secondary" color="neutral_500" fontWeight="bold">
              ·
            </Text>
            <Text variant="secondary" color="neutral_500">
              {time}
            </Text>
          </>
        ) : null}
      </View>
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
          <PostImages images={post.images} />
        </View>
      ) : null}
    </Pressable>
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
        <Block width={24} height={24} />
        <Block width={120} />
      </View>
      <View style={Atoms.mt_xs}>
        <Block width="90%" />
      </View>
    </Animated.View>
  );
}
