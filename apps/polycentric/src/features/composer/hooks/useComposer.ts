import { processAndUploadImage } from '@/src/common/lib/images/processAndUploadImage';
import {
  hexToBytes,
  truncateName,
  useCurrentIdentity,
  usePolycentric,
  useUsername,
  type PostData,
} from '@/src/common/lib/polycentric-hooks';
import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import {
  feedQueryKeys,
  injectPostIntoFeedCache,
} from '@/src/features/feed/hooks/feedCache';
import { injectReplyIntoThreadCache } from '@/src/features/post/hooks/useThread';
import { COLLECTION, types, v2 } from '@polycentric/react-native';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef } from 'react';
import { useComposerStore } from './useComposerStore';

export const MAX_ATTACHMENTS = 4;

/** Longest edge lengths for post image variants. */
const POST_VARIANT_SIZES = [512, 1280];

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

/**
 * All composer state + behavior, shared between the sheet/modal composer
 * (`ComposeSheet`) and the full-screen compose tab (`ComposeTabScreen`). The
 * presentation chrome (Sheet vs Screen) and dismiss target live in the callers.
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
  const removeAttachment = useComposerStore((s) => s.removeAttachment);
  const setSubmitting = useComposerStore((s) => s.setSubmitting);
  const setError = useComposerStore((s) => s.setError);
  const resetComposer = useComposerStore((s) => s.reset);

  const isReply = !!replyTo;
  const title = isReply ? 'Reply' : 'New Post';
  const canPost =
    (text.trim().length > 0 || attachments.length > 0) && !submitting;
  const attachDisabled = submitting || attachments.length >= MAX_ATTACHMENTS;

  const handleClose = useCallback(() => {
    if (!submitting) onClose();
  }, [submitting, onClose]);

  const handleAttachImage = useCallback(async () => {
    if (attachDisabled) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      selectionLimit: MAX_ATTACHMENTS - attachments.length,
    });
    if (result.canceled || !result.assets?.length) return;

    const additions = result.assets
      .slice(0, MAX_ATTACHMENTS - attachments.length)
      .map((asset, i) => ({
        id: `${Date.now()}-${i}-${asset.uri}`,
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
      }));
    addAttachments(additions);
  }, [attachDisabled, attachments.length, addAttachments]);

  const handleRemoveAttachment = useCallback(
    (id: string) => removeAttachment(id),
    [removeAttachment],
  );

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
      // Process + upload attachments first so every blob body is on
      // the server before the content that references it.
      const imageSets: v2.ImageSet[] =
        attachments.length > 0
          ? await Promise.all(
              attachments.map((a) =>
                processAndUploadImage(client, a.uri, {
                  mode: 'fit',
                  sizes: POST_VARIANT_SIZES,
                }),
              ),
            )
          : [];

      const post: types.v2.Post = {
        text: text.trim(),
        images: imageSets,
      };

      if (isReply) {
        post.reply = {
          root: replyRootEventKey,
          parent: replyToEventKey,
        };
      }

      if (!!quote) {
        post.quote = v2.EventKey.fromBinary(hexToBytes(quote.id));
      }

      const content = client.contentManager.build({
        oneofKind: 'post',
        post,
      });

      await client.contentManager.save(content);

      const event = await client.buildEvent(content);

      const signedEvent = await client.signEvent(event);

      const newBundle = v2.EventBundle.create({
        signedEvent,
        serializedContent: { contentBytes: v2.Content.toBinary(content) },
      });
      const identity = currentIdentityKey ?? '';

      // Optimistically add the new event to the below query
      if (isReply && replyTo) {
        injectReplyIntoThreadCache(replyTo.id, newBundle);
      }
      injectPostIntoFeedCache(feedQueryKeys.following(), newBundle);
      injectPostIntoFeedCache(feedQueryKeys.identity(identity), newBundle);
      injectPostIntoFeedCache(feedQueryKeys.explore(identity), newBundle);

      // `commitEvent` persists the event locally
      await client.commitEvent(signedEvent, content);

      setSubmitting(false);
      onClose();
      resetComposer();

      void client
        .sync()
        .then(() => {
          // Invalidate all the caches now the post has been successfully submitted
          invalidateQuery(client, feedQueryKeys.following());
          invalidateQuery(client, feedQueryKeys.identity(identity));
          invalidateQuery(client, feedQueryKeys.explore(identity));
        })
        .catch((err) => {
          console.warn('compose sync failed:', err);
        });
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
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
    resetComposer,
    setSubmitting,
    setError,
    onClose,
  ]);

  const placeholder = isReply
    ? `Reply to ${truncateName(replyAuthorName, 16)}...`
    : "What's on your mind?";

  return {
    // state
    text,
    setText,
    attachments,
    submitting,
    error,
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
    handleRemoveAttachment,
  };
}
