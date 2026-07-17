import { toast } from '@/src/common/components/toast/useToast';
import { useLinkPreviews } from '@/src/common/link-previews';
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
import { parseTextLinks } from '@/src/common/util/parseTextLinks';
import {
  feedQueryKeys,
  injectPostIntoFeedCache,
} from '@/src/features/feed/hooks/feedCache';
import { injectReplyIntoThreadCache } from '@/src/features/post/hooks/useThread';
import { COLLECTION, types, v2 } from '@polycentric/react-native';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { useComposerStore } from './useComposerStore';

export const MAX_ATTACHMENTS = 4;

/** Longest edge lengths for post image variants. */
const POST_VARIANT_SIZES = [512, 1280];

const POST_IMAGE_OPTIONS = {
  mode: 'fit',
  sizes: POST_VARIANT_SIZES,
} as const;

/**
 * In-flight (or completed) image processing+upload promises, keyed by
 * attachment id. We start the work as soon as an image is attached so the
 * blobs are usually on the server by the time the user hits Post; `handlePost`
 * then just awaits these instead of starting from scratch. Module-level so it
 * survives the hook remounting (sheet composer vs. full-screen tab).
 */
const uploadCache = new Map<string, Promise<v2.ImageSet>>();

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
  const { enabled: linkPreviewsEnabled } = useLinkPreviews();

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

  // Live link preview. The card previews `previewUrl`, which is only ever
  // set by `settlePreviewUrl` spotting a newly typed link, and cleared by the
  // X button (or the link leaving the draft) — so a removed preview stays
  // removed until the user types another url. The resolved Link is reused at
  // post time (see handlePost) so we don't fetch it twice.
  const [linkPreview, setLinkPreview] = useState<v2.Link | null>(null);
  const [linkPreviewLoading, setLinkPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrlState] = useState<string | null>(null);
  // Mirror of `previewUrl` so `settlePreviewUrl` can read and return the
  // target synchronously (handlePost can't wait for a re-render).
  const previewUrlRef = useRef<string | null>(null);
  const setPreviewUrl = useCallback((url: string | null) => {
    previewUrlRef.current = url;
    setPreviewUrlState(url);
  }, []);

  // Every url in the draft, in order, duplicates kept.
  const textLinks = useMemo(
    () =>
      parseTextLinks(text)
        .filter((s) => s.type === 'link')
        .map((s) => s.url),
    [text],
  );

  // The draft's urls as of the last settle (or preview removal): the baseline
  // the next settle diffs against to spot newly typed links.
  const settledLinksRef = useRef<string[]>([]);

  // Diff the draft's urls against the baseline; a url the baseline doesn't
  // account for was just typed — an appended link, an old link edited into a
  // new spelling, or a deleted link retyped — and becomes the preview target
  // if and only if there is no target already. Runs post-debounce (and at
  // post time), so intermediate spellings never enter the baseline.
  const settlePreviewUrl = useCallback(() => {
    // Multiset diff: each current url consumes one baseline occurrence, so a
    // duplicate of an existing link still counts as new.
    const remaining = new Map<string, number>();
    for (const url of settledLinksRef.current) {
      remaining.set(url, (remaining.get(url) ?? 0) + 1);
    }
    let typedUrl: string | null = null;
    for (const url of textLinks) {
      const count = remaining.get(url) ?? 0;
      if (count === 0) typedUrl = typedUrl ?? url;
      else remaining.set(url, count - 1);
    }
    settledLinksRef.current = textLinks;
    if (!previewUrlRef.current && typedUrl) setPreviewUrl(typedUrl);
    return previewUrlRef.current;
  }, [textLinks, setPreviewUrl]);

  // Debounce the settle so we don't adopt every intermediate url while the
  // user is still typing it. The previewed link leaving the draft clears the
  // card immediately, though — a deleted link shouldn't keep its preview.
  useEffect(() => {
    if (previewUrlRef.current && !textLinks.includes(previewUrlRef.current)) {
      setPreviewUrl(null);
      setLinkPreview(null);
      setLinkPreviewLoading(false);
    }
    const handle = setTimeout(settlePreviewUrl, 1000);
    return () => clearTimeout(handle);
  }, [textLinks, settlePreviewUrl, setPreviewUrl]);

  // Unfurl the target via the server. No extra debounce: targets only change
  // on settle, which is already debounced.
  useEffect(() => {
    if (!previewUrl || !linkPreviewsEnabled) {
      setLinkPreview(null);
      setLinkPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setLinkPreviewLoading(true);
    void client.urlInfo(previewUrl).then((info) => {
      if (cancelled) return;
      // The endpoint returns metadata only; attach the URL we requested.
      setLinkPreview(
        info ? v2.Link.create({ ...info, url: previewUrl }) : null,
      );
      setLinkPreviewLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [previewUrl, client, linkPreviewsEnabled]);

  const isReply = !!replyTo;
  const title = isReply ? 'Reply' : 'New Post';
  // While the link preview is fetching, hold the Post button so the user
  // either waits for the card (it gets embedded in the signed post) or
  // removes it with the X, which clears the loading state.
  const canPost =
    (text.trim().length > 0 || attachments.length > 0) &&
    !submitting &&
    !linkPreviewLoading;
  const attachDisabled = submitting || attachments.length >= MAX_ATTACHMENTS;

  // Reset composer state and drop any in-flight/cached uploads so nothing
  // carries over to the next open.
  const resetAll = useCallback(() => {
    uploadCache.clear();
    // Start the next draft with a clean preview slate: no target, and an
    // empty baseline so its first link diffs as new.
    settledLinksRef.current = [];
    setPreviewUrl(null);
    setLinkPreview(null);
    setLinkPreviewLoading(false);
    resetComposer();
  }, [resetComposer, setPreviewUrl]);

  // X button on the link preview (loading or resolved): clear the target and
  // fold the draft's current links into the baseline, so they can never diff
  // as new again — only typing another url brings a preview back.
  const handleRemoveLinkPreview = useCallback(() => {
    settledLinksRef.current = textLinks;
    setPreviewUrl(null);
    setLinkPreview(null);
    setLinkPreviewLoading(false);
  }, [textLinks, setPreviewUrl]);

  // Begin processing + uploading an attachment immediately, caching the
  // promise by id so `handlePost` can await the already-running work (it waits
  // here if the user hits Post before processing finishes). The attachment's
  // `status` drives the thumbnail's loading/error overlay.
  const startUpload = useCallback(
    (id: string, uri: string) => {
      const work = processAndUploadImage(client, uri, POST_IMAGE_OPTIONS);
      uploadCache.set(id, work);
      work.then(
        () => setAttachmentStatus(id, 'ready'),
        () => {
          // Drop the failed promise so the post path can retry from scratch,
          // and surface the failure on the thumbnail.
          uploadCache.delete(id);
          setAttachmentStatus(id, 'error');
        },
      );
    },
    [client, setAttachmentStatus],
  );

  const handleClose = useCallback(() => {
    if (submitting) return;
    onClose();
    // Reset here too: the native compose tab stays mounted after closing,
    // so the unmount reset below wouldn't fire for it.
    resetAll();
  }, [submitting, onClose, resetAll]);

  // Turn picked/captured assets into attachments: show the thumbnails
  const ingestAssets = useCallback(
    (assets: ImagePicker.ImagePickerAsset[]) => {
      const numAttachments = MAX_ATTACHMENTS - attachments.length;
      if (numAttachments <= 0) return;
      const additions = assets.slice(0, numAttachments).map((asset, i) => ({
        id: `${Date.now()}-${i}-${asset.uri}`,
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        status: 'processing' as const,
      }));
      addAttachments(additions);
      additions.forEach((a) => startUpload(a.id, a.uri));
      setError(null);
    },
    [attachments.length, addAttachments, startUpload, setError],
  );

  // Pick existing photo(s) from the media library.
  const handleAttachImage = useCallback(async () => {
    if (attachDisabled) return;
    // Dismiss the keyboard first so TrueSheet resets its footer keyboard
    // offset; otherwise the footer keeps the keyboard gap after the picker
    // closes (the keyboard is gone, but the inset/offset lingers).
    Keyboard.dismiss();
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      selectionLimit: MAX_ATTACHMENTS - attachments.length,
    });
    if (result.canceled || !result.assets?.length) return;
    ingestAssets(result.assets);
  }, [attachDisabled, attachments.length, ingestAssets]);

  // Capture a new photo with the camera (mobile only).
  const handleCaptureImage = useCallback(async () => {
    if (attachDisabled) return;
    Keyboard.dismiss();
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera permission is required to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync();
    if (result.canceled || !result.assets?.length) return;
    ingestAssets(result.assets);
  }, [attachDisabled, ingestAssets, setError]);

  const handleRemoveAttachment = useCallback(
    (id: string) => {
      removeAttachment(id);
      uploadCache.delete(id);
      setError(null);
    },
    [removeAttachment, setError],
  );

  // Editing the draft (text or images) clears any prior post error.
  const handleTextChange = useCallback(
    (next: string) => {
      setText(next);
      setError(null);
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
      // Attachments started processing/uploading when they were added, so
      // every blob body is usually already on the server. Await those cached
      // promises; fall back to a fresh run if one is missing or previously
      // failed (the catch in `startUpload` evicts failures).
      const imageSets: v2.ImageSet[] =
        attachments.length > 0
          ? await Promise.all(
              attachments.map(
                (a) =>
                  uploadCache.get(a.id) ??
                  processAndUploadImage(client, a.uri, POST_IMAGE_OPTIONS),
              ),
            )
          : [];

      // Embed the targeted url's preview in the signed post. Settle now so a
      // url typed within the debounce window still gets its preview (and a
      // removed preview stays removed — its links are already baselined, so
      // the diff yields nothing). Reuse the live preview when it matches;
      // otherwise fetch fresh. Best-effort — null yields no card.
      const targetUrl = linkPreviewsEnabled ? settlePreviewUrl() : null;
      let link =
        targetUrl && linkPreview && linkPreview.url === targetUrl
          ? linkPreview
          : null;
      if (!link && targetUrl) {
        const info = await client.urlInfo(targetUrl);
        // Metadata-only response; populate the URL we requested.
        link = info ? v2.Link.create({ ...info, url: targetUrl }) : null;
      }

      const post: types.v2.Post = {
        text: text.trim(),
        images: imageSets,
        links: link ? [link] : [],
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
      toast.success(isReply ? 'Reply posted' : 'Post published');
      onClose();
      resetAll();

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
    linkPreview,
    linkPreviewsEnabled,
    settlePreviewUrl,
    resetAll,
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
