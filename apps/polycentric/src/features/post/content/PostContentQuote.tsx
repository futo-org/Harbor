import {
  IdentityTag,
  ProfileAvatar,
  Text,
} from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { timeAgo, truncateName } from '@/src/common/lib/polycentric-hooks';
import {
  getKeyFingerprint,
  hexToBytes,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { v2 } from '@polycentric/react-native';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { usePostById } from '../hooks/usePostById';
import { PostImages } from '../PostImages';

const QUOTE_PREVIEW_LIMIT = 200;

/** Embedded preview of a quoted post. Rendered inside a parent Post
 *  when its `quoteId` is set. Tapping routes to the quoted post. */
export function PostContentQuote({ quoteId }: { quoteId: string }) {
  const { theme } = useTheme();

  const eventKey = useMemo(() => {
    try {
      return v2.EventKey.fromBinary(hexToBytes(quoteId));
    } catch {
      return null;
    }
  }, [quoteId]);

  const { post } = usePostById(
    eventKey?.identity,
    getKeyFingerprint(eventKey?.signedBy),
    eventKey?.sequence,
  );

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

  if (!post) return null;

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
        Atoms.mt_md,
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
        <Text variant="secondary" fontWeight="bold">
          {truncateName(authorName || '…', 16)}
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
