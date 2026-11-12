import { Text } from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import {
  hexToBytes,
  isGrayjay,
  thirdPartyApplication,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { Atoms } from '@/src/common/theme';
import { HARBOR_APPLICATION } from '@/src/common/util/application';
import { urlHost } from '@/src/common/util/anywhere-url';
import { isBrowserExtension } from '@/src/common/util/platform';
import { Username } from '@/src/features/profile/Username';
import { v2 } from '@polycentric/react-native';
import { type ExternalPathString, Link, router } from 'expo-router';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { Pressable, View } from 'react-native';

/** The address of the page a list's posts are all about, if it is such a list. */
export const AnywhereUrlContext = createContext<string | undefined>(undefined);

/**
 * The line over a post's text: who it replies to, then the page it is about
 * or the application it was posted with. Nothing when none apply.
 */
export function PostSubheader({
  post,
  hideReplyingTo,
}: {
  post: PostData;
  hideReplyingTo: boolean;
}) {
  const replyParentId = hideReplyingTo ? undefined : post.reply?.parentId;
  // Not worth saying of posts made with the app showing them, nor of
  // Grayjay's comments on a page.
  const withApp =
    post.application?.id === HARBOR_APPLICATION.id ||
    (isGrayjay(post.application) && post.attributedLink)
      ? undefined
      : thirdPartyApplication(post.application);
  // Not shown where every post listed is about the same page.
  const listedUrl = useContext(AnywhereUrlContext);
  const aboutLink =
    replyParentId ||
    isBrowserExtension ||
    post.attributedLink?.url === listedUrl
      ? undefined
      : post.attributedLink;

  if (!replyParentId && !aboutLink && !withApp) return null;

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.max_w_full,
        Atoms.mr_3xl,
      ]}
    >
      {replyParentId ? <ReplyingToSubheader parentId={replyParentId} /> : null}
      {aboutLink ? (
        <CommentedOnSubheader link={aboutLink} />
      ) : withApp ? (
        <ApplicationSubheader
          {...withApp}
          prefix={replyParentId ? ' with ' : 'Posted with '}
        />
      ) : null}
    </View>
  );
}

/** The page a post is about, linked. */
function CommentedOnSubheader({ link }: { link: v2.Link }) {
  const host = urlHost(link.url);

  return (
    // One text run, so a long title wraps under "Commented on".
    <Text
      variant="secondary"
      color="neutral_500"
      fontWeight="regular"
      style={Atoms.flex_shrink_1}
    >
      Commented on{' '}
      <Link
        className="underlineOnHover"
        href={Routes.tabs.anywhere.url(link.url)}
        // Opens the page's posts, not the post it is on.
        onPress={(e) => e.stopPropagation()}
      >
        <Text variant="secondary" color="primary_500" fontWeight="regular">
          {/* A page with no known title is shown by its address. */}
          {link.title && host ? `${link.title} · ${host}` : link.url}
        </Text>
      </Link>
    </Text>
  );
}

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
      <Username
        identity={parentIdentity}
        variant="secondary"
        color="primary_500"
      />
    </Pressable>
  );
}
