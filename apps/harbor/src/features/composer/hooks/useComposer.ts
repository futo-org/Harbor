import { toast } from '@/src/common/components/toast/useToast';
import { confirm } from '@/src/common/lib/dialogs';
import { useImageAttachments } from '@/src/common/lib/images/useImageAttachments';
import {
  eventKeyId,
  hexToBytes,
  truncateName,
  useCurrentIdentity,
  usePolycentric,
  useUsername,
  type PostData,
} from '@/src/common/lib/polycentric-hooks';
import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import {
  type PendingShareImage,
  usePendingShareStore,
} from '@/src/features/share-intake/usePendingShareStore';
import {
  alterPostReplyCount,
  alterPostQuoteCount,
  feedQueryKeys,
  injectPostIntoFeedCache,
  injectReplyIntoThreadCache,
  threadQueryKey,
} from '@/src/features/feed/hooks/feedCache';
import {
  COLLECTION,
  type types,
  v2,
  type PolycentricClient,
  FetchMode,
  Query,
} from '@polycentric/react-native';
import { usePreventRemove } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useComposerStore } from './useComposerStore';
import { spliceMentions } from '../utils/spliceMentions';
import { useLinkPreview } from './useLinkPreview';
import { formatImageImportErrorOrFallback } from '@/src/common/lib/images/ImageImportError';
import {
  decodePostBundle,
  getKeyFingerprint,
} from '@/src/common/lib/polycentric-hooks/helpers';

export const MAX_POST_LENGTH = 2000;

export type UseComposerArgs = {
  /** TODO: should be v2 `SignedEvent` */
  onPostCreated: (signedEvent: types.SignedEvent) => void | Promise<void>;
  replyTo?: PostData | null;
  quote?: PostData | null;
  /** Open the image picker as soon as the composer mounts. */
  attachOnMount?: boolean;
  /**
   * Dismiss the composer. Called by the close (X) button and after a
   * successful post. The sheet pops the modal route; the full-screen tab
   * returns to the previously selected tab.
   */
  onClose: () => void;
};

// Stable, and current right after `resetAll()` (a share replacing a draft).
const getComposerAttachments = () => useComposerStore.getState().attachments;

/**
 * All composer state + behavior for `ComposeSheet`, which owns the
 * presentation chrome and dismiss target.
 */
export function useComposer({
  onPostCreated,
  replyTo,
  quote,
  attachOnMount = false,
  onClose,
}: UseComposerArgs) {
  const client = usePolycentric();
  const { identityKey: currentIdentityKey } = useCurrentIdentity();

  const onPostCreatedRef = useRef(onPostCreated);
  onPostCreatedRef.current = onPostCreated;

  const replyToEventKey = v2.EventKey.create({
    collection: COLLECTION.FEED,
    identity: replyTo?.identity,
    signedBy: replyTo?.signedBy,
    sequence: BigInt(replyTo?.sequence ?? 0),
  });

  // If replyTo is itself a reply, inherit its root.
  // Otherwise, replyTo *is* the root.
  const replyRootEventKey = replyTo?.reply?.rootId
    ? v2.EventKey.fromBinary(hexToBytes(replyTo.reply.rootId))
    : replyToEventKey;

  const replyAuthorName = useUsername(replyTo?.identity ?? null);

  const text = useComposerStore((s) => s.text);
  const attachments = useComposerStore((s) => s.attachments);
  const submitting = useComposerStore((s) => s.submitting);
  const error = useComposerStore((s) => s.error);
  const setText = useComposerStore((s) => s.setText);
  const addAttachments = useComposerStore((s) => s.addAttachments);
  const setAttachmentStatus = useComposerStore((s) => s.setAttachmentStatus);
  const removeAttachment = useComposerStore((s) => s.removeAttachment);
  const setSubmitting = useComposerStore((s) => s.setSubmitting);
  const setError = useComposerStore((s) => s.setError);
  const resetComposer = useComposerStore((s) => s.reset);

  const {
    attachDisabled,
    handleAttachImage,
    handleCaptureImage,
    handleRemoveAttachment,
    resolveImageSets,
    ingestAssets,
  } = useImageAttachments({
    getAttachments: getComposerAttachments,
    addAttachments,
    setAttachmentStatus,
    removeAttachment,
    disabled: submitting,
    setError,
  });

  // Live link preview: spotting a newly typed url, unfurling it, and reusing
  // the resolved Link at post time. See `useLinkPreview` for the state machine.
  const {
    linkPreview,
    linkPreviewLoading,
    handleRemove: handleRemoveLinkPreview,
    reset: resetLinkPreview,
    resolveLinkForPost,
  } = useLinkPreview(text);

  const isReply = !!replyTo;
  const title = isReply ? 'Reply' : 'New Post';
  const hasDraft = text.trim().length > 0 || attachments.length > 0;
  // While the link preview is fetching, hold the Post button so the user
  // either waits for the card (it gets embedded in the signed post) or
  // removes it with the X, which clears the loading state.
  const canPost =
    hasDraft &&
    text.length <= MAX_POST_LENGTH &&
    !submitting &&
    !linkPreviewLoading;

  const [posted, setPosted] = useState(false);
  useDiscardDraftConfirmation(hasDraft && !posted, isReply);

  // Reset composer state so nothing carries over to the next open.
  const resetAll = useCallback(() => {
    resetLinkPreview();
    resetComposer();
  }, [resetComposer, resetLinkPreview]);

  const handleClose = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [submitting, onClose]);

  // Editing the draft (text or images) clears any prior post error.
  const handleTextChange = useCallback(
    (next: string) => {
      setError(null);
      return setText(next);
    },
    [setText, setError],
  );

  // Reset the entire composer (text, attachments, submitting, error) when
  // it closes (unmounts), so nothing carries over to the next open.
  useEffect(() => {
    return () => {
      resetAll();
    };
  }, [resetAll]);

  useTakePendingShare({ hasDraft, resetAll, setText, ingestAssets });

  // Auto-open the image picker once when the caller requested it
  // (e.g. tapping the attach icon in the inline composer).
  const attachOnMountFiredRef = useRef(false);
  useEffect(() => {
    if (!attachOnMount || attachOnMountFiredRef.current) return;
    attachOnMountFiredRef.current = true;
    void handleAttachImage();
  }, [attachOnMount, handleAttachImage]);

  const handlePost = useCallback(async () => {
    if (submitting) return;
    if (text.trim().length === 0 && attachments.length === 0) return;

    setError(null);
    setSubmitting(true);
    try {
      const imageSets = await resolveImageSets();

      // Embed the targeted url's preview in the signed post (best-effort —
      // null yields no card).
      const link = await resolveLinkForPost();

      const post: v2.Post = {
        // Trimmed after splicing: ranges are offsets into the untrimmed text.
        text: spliceMentions(
          text,
          useComposerStore.getState().mentionRanges,
        ).trim(),
        images: imageSets,
        links: link ? [link] : [],
        // Tag posts authored in Harbor with the client label (Post.labels).
        labels: ['harbor'],
        // Regular posts aren't attributed to an external URL.
        attributedTo: [],
      };

      if (isReply) {
        post.reply = {
          root: replyRootEventKey,
          parent: replyToEventKey,
        };
      }

      if (quote) {
        post.quote = v2.EventKey.fromBinary(hexToBytes(quote.id));
      }

      const content = client.contentManager.build({
        oneofKind: 'post',
        post,
      });

      const { signedEvent, contentBytes } = await client.createEvent({
        collection: COLLECTION.FEED,
        content,
      });

      const newBundle = v2.EventBundle.create({
        signedEvent,
        serializedContent: { contentBytes },
      });
      const identity = currentIdentityKey ?? '';

      // Optimistically add the new event to feeds and threads
      injectLocally(
        identity,
        newBundle,
        replyTo ?? undefined,
        quote ?? undefined,
      );

      setSubmitting(false);
      toast.success(isReply ? 'Reply posted' : 'Post published');

      // Don't close the composer here: the "Discard post?" guard is still on and
      // would show. Setting `posted` turns the guard off, and the effect below then
      // closes the composer. Its draft is cleared when the composer unmounts.
      setPosted(true);

      void client
        .sync()
        .then(() => refreshAfterPosting(client, identity, post))
        .catch((err) => {
          console.warn('compose sync failed:', err);
        });
    } catch (err) {
      console.error(err);
      setError(
        formatImageImportErrorOrFallback(
          err,
          "Couldn't publish the post. Try again.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    text,
    attachments,
    submitting,
    client,
    currentIdentityKey,
    isReply,
    quote,
    replyTo,
    replyToEventKey,
    replyRootEventKey,
    resolveImageSets,
    resolveLinkForPost,
    setSubmitting,
    setError,
  ]);

  useEffect(() => {
    if (posted) onClose();
  }, [posted, onClose]);

  const placeholder = isReply
    ? `Reply to ${truncateName(replyAuthorName, 16)}...`
    : "What's on your mind?";

  return {
    // state
    text,
    setText: handleTextChange,
    attachments,
    submitting,
    error,
    linkPreview,
    linkPreviewLoading,
    // computed
    isReply,
    title,
    placeholder,
    canPost,
    attachDisabled,
    currentIdentityKey,
    replyTo,
    quote,
    // handlers
    handleClose,
    handlePost,
    handleAttachImage,
    handleCaptureImage,
    handleRemoveAttachment,
    handleRemoveLinkPreview,
  };
}

function useDiscardDraftConfirmation(
  hasUnpostedDraft: boolean,
  isReply: boolean,
) {
  // Every way of closing removes this route (Cancel/X, Escape, backdrop,
  // swipe back, hardware back, browser back, reload, closing the tab), so
  // guard the removal itself.
  const [isDiscarded, setIsDiscarded] = useState(false);
  usePreventRemove(hasUnpostedDraft && !isDiscarded, ({ repeat }) => {
    void confirm({
      title: isReply ? 'Discard reply?' : 'Discard post?',
      message: "Your changes won't be saved.",
      confirmText: 'Discard',
      destructive: true,
      onConfirm: () => {
        // The draft is still there while the screen is removed; clear
        // `preventRemove` along with `repeat`, as expo-router expects
        setIsDiscarded(true);
        repeat();
      },
    });
  });
}

/**
 * Take a share into the draft, asking first when it would replace one. It may
 * arrive after mounting: on a cold start the composer opens before the shared
 * images are imported.
 */
function useTakePendingShare({
  hasDraft,
  resetAll,
  setText,
  ingestAssets,
}: {
  hasDraft: boolean;
  resetAll: () => void;
  setText: (text: string) => void;
  ingestAssets: (assets: PendingShareImage[]) => void;
}) {
  const pendingShare = usePendingShareStore((s) => s.pendingShare);

  useEffect(() => {
    if (!pendingShare) return;

    usePendingShareStore.getState().clearPendingShare();

    const replaceDraftWithShare = () => {
      resetAll();
      setText(pendingShare.text);
      ingestAssets(pendingShare.images);
    };

    if (!hasDraft) {
      replaceDraftWithShare();
      return;
    }

    void confirm({
      title: 'Discard post?',
      message: 'Shared content will replace your draft.',
      confirmText: 'Discard',
      destructive: true,
      onConfirm: replaceDraftWithShare,
    });
  }, [pendingShare, hasDraft, resetAll, setText, ingestAssets]);
}

/**
 * Adjust some local feed/thread caches and counters to account for this new
 * post.
 */
function injectLocally(
  identity: string,
  bundle: v2.EventBundle,
  replyTo: PostData | undefined,
  quoted: PostData | undefined,
): void {
  if (replyTo) {
    injectReplyIntoThreadCache(bundle);
    alterPostReplyCount(threadQueryKey(replyTo.id), replyTo.id, 1);
    alterPostReplyCount(feedQueryKeys.following(identity), replyTo.id, 1);
    alterPostReplyCount(
      feedQueryKeys.identity(replyTo.identity),
      replyTo.id,
      1,
    );
    alterPostReplyCount(feedQueryKeys.explore(identity), replyTo.id, 1);
  }

  if (quoted) {
    alterPostQuoteCount(threadQueryKey(quoted.id), quoted.id, 1);
    alterPostQuoteCount(feedQueryKeys.following(identity), quoted.id, 1);
    alterPostQuoteCount(feedQueryKeys.identity(quoted.identity), quoted.id, 1);
    alterPostQuoteCount(feedQueryKeys.explore(identity), quoted.id, 1);
  }

  injectPostIntoFeedCache(feedQueryKeys.following(identity), bundle);
  injectPostIntoFeedCache(feedQueryKeys.identity(identity), bundle);
  injectPostIntoFeedCache(feedQueryKeys.explore(identity), bundle);
}

/**
 * After the new post has been synced to servers, refresh queries
 * that could contain this post by fetching new server responses.
 */
async function refreshAfterPosting(
  client: PolycentricClient,
  identity: string,
  post: v2.Post,
): Promise<void> {
  // Feeds
  invalidateQuery(client, feedQueryKeys.following(identity));
  invalidateQuery(client, feedQueryKeys.identity(identity));
  invalidateQuery(client, feedQueryKeys.explore(identity));

  // Threads
  const ancestors: Set<string> = new Set();
  const parent = post.reply?.parent;
  if (!parent) return;

  try {
    for (
      let current: string | undefined = eventKeyId(parent);
      current;
      current = await getParentPost(client, current)
    ) {
      if (ancestors.has(current)) break;
      ancestors.add(current);
    }
  } catch (e) {
    console.warn(`error while walking new post ancestors: ${e}`);
  }

  for (const postId of ancestors) {
    invalidateQuery(client, threadQueryKey(postId));
  }
}

/**
 * Fetches the parent of the post identified by `postId` from rs-core's store,
 * or returns undefined if the post has no parent that we have locally.
 * Returns the post id of the parent if we find it.
 */
async function getParentPost(
  client: PolycentricClient,
  postId: string,
): Promise<string | undefined> {
  const key = v2.EventKey.fromBinary(hexToBytes(postId));

  const data = await new Promise<ArrayBuffer | undefined>((resolve) => {
    let latest: ArrayBuffer | undefined;
    client.core
      .fetchQuery(
        undefined,
        new Query.GetEvent({
          identity: key.identity,
          collection: COLLECTION.FEED,
          sequence: key.sequence,
          signerKeyPrefix: getKeyFingerprint(key.signedBy),
        }),
        { fetchMode: FetchMode.OfflineOnly },
      )
      .subscribe({
        next: (result) => {
          latest = result.data;
        },
        error: () => resolve(undefined),
        complete: () => resolve(latest),
      });
  });

  if (!data?.byteLength) return undefined;

  const post = decodePostBundle(
    v2.EventBundle.fromBinary(new Uint8Array(data)),
  );

  return post?.reply?.parentId;
}
