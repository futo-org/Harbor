import { Box } from '@/src/common/components/layouts';
import {
  Avatar,
  Button,
  PubkeyTag,
  Text,
  TextInput,
} from '@/src/common/components/primitives';
import {
  decodePostEvent,
  getPointer,
  identiconUrl,
  truncateName,
  useCurrentIdentity,
  usePolycentric,
  useUsername,
} from '@/src/common/lib/polycentric-hooks';
import { SheetHeaderBlock, useSheetContext } from '@/src/common/lib/sheet';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { types, v2 } from '@polycentric/react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { ComposeSheetFooterBar } from './ComposeSheetFooterBar';

interface ComposeSheetInnerProps {
  onPostCreated: (signedEvent: types.v2.SignedEvent) => void | Promise<void>;
  onAvatarPress?: () => void;
  replyToEvent?: types.SignedEvent | null;
}

export function ComposeSheetInner({
  onPostCreated,
  onAvatarPress,
  replyToEvent,
}: ComposeSheetInnerProps) {
  const client = usePolycentric();
  const { publicKey, identity: currentIdentity } = useCurrentIdentity();
  const username = useUsername(publicKey ?? types.PublicKey.create());
  const avatarUrl = publicKey ? identiconUrl(publicKey) : undefined;
  const { theme } = useTheme();
  const { isOpen, dismissSheet } = useSheetContext();

  const replyDecoded = replyToEvent ? decodePostEvent(replyToEvent) : null;

  const replyToEventRef = useRef(replyToEvent);
  replyToEventRef.current = replyToEvent;
  const onPostCreatedRef = useRef(onPostCreated);
  onPostCreatedRef.current = onPostCreated;
  const replyAuthorPubkey =
    replyDecoded?.authorPublicKey ?? types.PublicKey.create();
  const replyAuthorName = useUsername(replyAuthorPubkey);
  const replyContent = replyDecoded?.content ?? '';
  const replyContentPreview =
    replyContent.length > 30 ? `${replyContent.slice(0, 30)}…` : replyContent;

  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReply = !!replyToEvent;
  const title = isReply ? 'Reply' : 'New Post';
  const canPost = text.trim().length > 0 && !submitting;

  const handleClose = useCallback(() => {
    if (!submitting) void dismissSheet();
  }, [submitting, dismissSheet]);

  const handlePost = useCallback(async () => {
    if (!text.trim() || submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      // let reference: types.Reference | undefined;
      // const reply = replyToEventRef.current;
      // if (reply) {
      //   const pointer = getPointer(client, reply);
      //   reference = types.Reference.create({
      //     referenceType: 2n,
      //     reference: types.Pointer.toBinary(pointer),
      //   });
      // }

      // TODO: reply references not yet supported in v2 createPost

      const content = client.contentManager.build({
        oneofKind: 'post',
        post: {
          text: text.trim(),
        },
      });
      await client.contentManager.save(content);

      const event = await client.buildEvent(content);

      event.vectorClocks = await client.buildVectorClock(event);

      const signedEvent = await client.signEvent(event);

      await client.commitEvent(signedEvent);

      await client.sync();
      setText('');
      await onPostCreatedRef.current(signedEvent);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }, [text, submitting, client]);

  useEffect(() => {
    if (!isOpen) {
      setText('');
      setError(null);
    }
  }, [isOpen]);

  const placeholder = isReply
    ? `Reply to ${truncateName(replyAuthorName, 16)}...`
    : "What's on your mind?";

  return (
    <Box style={[Atoms.flex_1, theme.atoms.bg]}>
      <SheetHeaderBlock
        title={title}
        onClose={handleClose}
        closeDisabled={submitting}
        trailing={
          isWeb ? (
            <View style={{ minWidth: 80, minHeight: 36 }} />
          ) : (
            <Box
              style={{
                minWidth: 80,
                minHeight: 36,
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
                  variant={canPost ? 'primary' : 'disabled'}
                  size="sm"
                />
              )}
            </Box>
          )
        }
      />
      <Box
        style={[
          Atoms.flex_1,
          {
            paddingHorizontal: 15,
            paddingTop: 10,
            minHeight: 0,
          },
        ]}
      >
        {isReply && (
          <Box
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
          </Box>
        )}

        {error && (
          <Box
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
          </Box>
        )}

        <Box style={[Atoms.flex_row, Atoms.items_start, Atoms.gap_md]}>
          <Pressable
            onPress={onAvatarPress}
            disabled={!onAvatarPress}
            style={{ marginTop: 3 }}
          >
            <Avatar
              source={avatarUrl ? { uri: avatarUrl } : undefined}
              size="sm"
            />
          </Pressable>
          <Box style={Atoms.flex_1}>
            <Box
              style={[
                Atoms.flex_row,
                Atoms.gap_xs,
                { alignItems: 'baseline', marginTop: -1 },
              ]}
            >
              <Pressable onPress={onAvatarPress} disabled={!onAvatarPress}>
                <Text
                  variant="secondary"
                  fontWeight="bold"
                  style={{ lineHeight: 18 }}
                >
                  {truncateName(username, 16)}
                </Text>
              </Pressable>
              {publicKey && (
                <PubkeyTag
                  publicKey={publicKey}
                  identity={currentIdentity?.identityKey ?? undefined}
                  style={{ transform: [{ translateY: 1 }] }}
                />
              )}
            </Box>
            <TextInput
              variant="plain"
              placeholder={placeholder}
              multiline
              scrollEnabled
              autoFocus
              value={text}
              onChangeText={setText}
              disabled={submitting}
              maxLength={2000}
              style={{
                paddingHorizontal: 0,
                paddingTop: 8,
                fontSize: 15,
                minHeight: 180,
                maxHeight: 280,
              }}
            />
          </Box>
        </Box>
      </Box>
      <ComposeSheetFooterBar
        variant={isWeb ? 'web' : 'native'}
        charCount={text.length}
        submitting={submitting}
        canPost={canPost}
        onPost={handlePost}
      />
    </Box>
  );
}
