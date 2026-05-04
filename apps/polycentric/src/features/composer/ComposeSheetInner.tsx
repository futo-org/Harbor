import {
  Button,
  IdentityTag,
  ProfileAvatar,
  Text,
  TextArea,
} from '@/src/common/components/primitives';
import {
  truncateName,
  useCurrentIdentity,
  usePolycentric,
  useUsername,
  type PostData,
} from '@/src/common/lib/polycentric-hooks';
import {
  DismissReason,
  SheetHeaderBlock,
  type DismissSheet,
} from '@/src/common/lib/sheet';
import { processAndUploadImage } from '@/src/common/lib/images/processAndUploadImage';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { COLLECTION, types, v2 } from '@polycentric/react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { ComposeSheetFooterBar } from './ComposeSheetFooterBar';
import { useComposerStore } from './hooks/useComposerStore';
import { Routes } from '@/src/common/constants';
import { router } from 'expo-router';

const MAX_ATTACHMENTS = 4;
const THUMBNAIL_SIZE = 72;

/** Longest edge lengths for post image variants. */
const POST_VARIANT_SIZES = [512, 1280];

interface ComposeSheetInnerProps {
  dismissSheet: DismissSheet;
  /** TODO: should be v2 `SignedEvent` */
  onPostCreated: (signedEvent: types.SignedEvent) => void | Promise<void>;
  replyTo?: PostData | null;
  /** Open the image picker as soon as the composer mounts. */
  attachOnMount?: boolean;
}

export function ComposeSheetInner({
  dismissSheet,
  onPostCreated,
  replyTo,
  attachOnMount = false,
}: ComposeSheetInnerProps) {
  const client = usePolycentric();
  const { identityKey: currentIdentityKey, identity: currentIdentity } =
    useCurrentIdentity();
  const username = useUsername(currentIdentityKey);
  const { theme } = useTheme();

  const onPostCreatedRef = useRef(onPostCreated);
  onPostCreatedRef.current = onPostCreated;

  const replyToEventKey = v2.EventKey.create({
    collection: COLLECTION.FEED,
    identity: replyTo?.identity,
    signedBy: replyTo?.signedBy,
    sequence: BigInt(replyTo?.sequence ?? 0),
  });

  const replyAuthorName = useUsername(replyTo?.identity ?? null);
  const replyContent = replyTo?.content ?? '';
  const replyContentPreview =
    replyContent.length > 30 ? `${replyContent.slice(0, 30)}…` : replyContent;

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
    if (!submitting) void dismissSheet(DismissReason.UserDismissed);
  }, [submitting, dismissSheet]);

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
                  sourceWidth: a.width,
                  sourceHeight: a.height,
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
          root: replyToEventKey,
          parent: replyToEventKey,
        };
      }

      const content = client.contentManager.build({
        oneofKind: 'post',
        post,
      });

      await client.contentManager.save(content);

      const event = await client.buildEvent(content);

      const signedEvent = await client.signEvent(event);

      // `commitEvent` persists the event locally and, when content is
      // passed, seeds the core's content store + emits contentCreated
      // with both signedEvent and content so feeds can decode directly.
      await client.commitEvent(signedEvent, content);

      resetComposer();
      await dismissSheet(DismissReason.PostSubmitted);
      void client.sync().catch((err) => {
        console.warn('compose sync failed:', err);
      });
      // TODO
      // await onPostCreatedRef.current(signedEvent);
    } catch (err) {
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
    dismissSheet,
    isReply,
    replyToEventKey,
    resetComposer,
    setSubmitting,
    setError,
  ]);

  const placeholder = isReply
    ? `Reply to ${truncateName(replyAuthorName, 16)}...`
    : "What's on your mind?";

  return (
    <View style={theme.atoms.bg}>
      <SheetHeaderBlock
        title={title}
        onClose={handleClose}
        closeDisabled={submitting}
        trailing={
          isWeb ? (
            <View style={{ minWidth: 80 }} />
          ) : (
            <View
              style={{
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              {submitting ? (
                <ActivityIndicator
                  size="small"
                  color={theme.palette.primary_500}
                  accessibilityLabel="Posting"
                />
              ) : (
                <Button
                  title="Post"
                  onPress={handlePost}
                  variant="primary"
                  disabled={!canPost}
                  size="sm"
                />
              )}
            </View>
          )
        }
      />
      <View
        style={[
          Atoms.flex_1,
          Atoms.py_lg,
          Atoms.px_lg,
          {
            minHeight: 200,
          },
        ]}
      >
        {/* Reply preview */}
        {isReply && (
          <View
            style={[
              Atoms.p_md,
              Atoms.rounded_md,
              {
                minHeight: 64,
                backgroundColor: withHexOpacity(
                  theme.palette.neutral_500,
                  '10',
                ),
                borderBottomWidth: 1,
                borderBottomColor: withHexOpacity(
                  theme.palette.neutral_500,
                  '20',
                ),
                marginBottom: 10,
              },
            ]}
          >
            <Text variant="small" style={theme.atoms.text_neutral_high}>
              Replying to {truncateName(replyAuthorName, 20)}
            </Text>
            <Text
              variant="secondary"
              numberOfLines={2}
              style={[theme.atoms.text_neutral_high, { marginTop: 2 }]}
            >
              {replyContentPreview}
            </Text>
          </View>
        )}

        {/* Error displays */}
        {error && (
          <View
            style={[
              Atoms.p_md,
              {
                borderBottomWidth: 1,
                borderBottomColor: withHexOpacity(
                  theme.palette.negative_500,
                  '80',
                ),
                marginBottom: 10,
              },
            ]}
          >
            <Text variant="secondary" color="negative_500">
              {error}
            </Text>
          </View>
        )}

        {/* Main block */}
        <View style={[Atoms.flex_row, Atoms.gap_md, Atoms.flex_1]}>
          {currentIdentityKey ? (
            <View style={[Atoms.self_start]}>
              <ProfileAvatar identityKey={currentIdentityKey} size="md" />
            </View>
          ) : null}
          <View style={Atoms.flex_1}>
            <TextArea
              variant="plain"
              placeholder={placeholder}
              autoFocus
              value={text}
              onChangeText={setText}
              disabled={submitting}
              maxLength={2000}
              style={[
                Atoms.px_0,
                Atoms.py_0,
                Atoms.pt_sm,
                Atoms.text_lg,
                Atoms.flex_1,
              ]}
            />
            {attachments.length > 0 && (
              <View
                style={[
                  Atoms.flex_row,
                  Atoms.gap_sm,
                  { flexWrap: 'wrap', marginTop: 8 },
                ]}
              >
                {attachments.map((a) => (
                  <AttachmentThumb
                    key={a.id}
                    uri={a.uri}
                    disabled={submitting}
                    onRemove={() => handleRemoveAttachment(a.id)}
                  />
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
      {/*  Footer */}
      <ComposeSheetFooterBar
        variant={isWeb ? 'web' : 'native'}
        charCount={text.length}
        submitting={submitting}
        canPost={canPost}
        onPost={handlePost}
        onAttachImage={() => void handleAttachImage()}
        attachDisabled={attachDisabled}
      />
    </View>
  );
}

function AttachmentThumb({
  uri,
  disabled,
  onRemove,
}: {
  uri: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: withHexOpacity(theme.palette.neutral_500, '20'),
      }}
    >
      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
      <Pressable
        onPress={onRemove}
        disabled={disabled}
        accessibilityLabel="Remove attachment"
        hitSlop={6}
        style={{
          position: 'absolute',
          top: 2,
          right: 2,
          width: 22,
          height: 22,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: withHexOpacity(theme.palette.black, 'b0'),
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <Ionicons name="close" size={14} color={theme.palette.white} />
      </Pressable>
    </View>
  );
}
