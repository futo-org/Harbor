import { useState, useEffect } from 'react';
import { Pressable, ActivityIndicator } from 'react-native';
import { Box } from '@/src/common/components/layouts';
import {
  Avatar,
  Text,
  TextInput,
  LinkButton,
  PubkeyTag,
  Button,
} from '@/src/common/components/primitives';
import {
  usePolycentric,
  useCurrentIdentity,
  useUsername,
  identiconUrl,
  truncateName,
  decodePostEvent,
  getPointer,
} from '@/src/common/lib/polycentric-hooks';
import { types } from '@polycentric/react-native';
import { useSheetContext } from '@/src/common/lib/sheet';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';

interface ComposeSheetInnerProps {
  dismiss: () => Promise<void>;
  onPostCreated: (signedEvent: types.SignedEvent) => void;
  onAvatarPress?: () => void;
  replyToEvent?: types.SignedEvent | null;
}

export function ComposeSheetInner({
  dismiss,
  onPostCreated,
  onAvatarPress,
  replyToEvent,
}: ComposeSheetInnerProps) {
  const client = usePolycentric();
  const { publicKey } = useCurrentIdentity();
  const username = useUsername(publicKey ?? types.PublicKey.create());
  const avatarUrl = publicKey ? identiconUrl(publicKey) : undefined;
  const { theme } = useTheme();
  const { isOpen, setHeader, setFooter } = useSheetContext();

  const replyDecoded = replyToEvent ? decodePostEvent(replyToEvent) : null;
  const replyPointer = replyToEvent ? getPointer(client, replyToEvent) : null;
  const replyAuthorPubkey =
    replyDecoded?.authorPublicKey ?? types.PublicKey.create();
  const replyAuthorName = useUsername(replyAuthorPubkey);
  const replyContent = replyDecoded?.content ?? '';

  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReply = !!replyToEvent;
  const title = isReply ? 'Reply' : 'New Post';
  const canPost = text.trim().length > 0 && !submitting;

  const handleClose = () => {
    if (!submitting) dismiss();
  };

  const handlePost = async () => {
    if (!text.trim() || submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      let reference: types.Reference | undefined;
      if (replyPointer) {
        reference = types.Reference.create({
          referenceType: 2n,
          reference: types.Pointer.toBinary(replyPointer),
        });
      }

      const signedEvent = await client.contentManager.createPost(
        text.trim(),
        undefined,
        reference,
      );
      await client.sync();
      setText('');
      onPostCreated(signedEvent);
      dismiss();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setText('');
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    setHeader(
      <Box
        style={[
          Atoms.flex_row,
          Atoms.justify_between,
          Atoms.items_center,
          Atoms.py_md,
          Atoms.px_lg,
          {
            backgroundColor: theme.palette.background_primary,
            borderBottomWidth: 1,
            borderBottomColor: withHexOpacity(theme.palette.neutral_500, '20'),
          },
        ]}
      >
        <LinkButton
          title="Cancel"
          onPress={handleClose}
          disabled={submitting}
          color={submitting ? 'neutral_500' : 'primary_500'}
        />
        <Text variant="body" fontWeight="semibold">
          {title}
        </Text>
        {submitting ? (
          <ActivityIndicator size="small" color={theme.palette.primary_500} />
        ) : (
          <Button
            title="Post"
            onPress={handlePost}
            variant={canPost ? 'primary' : 'disabled'}
            size="sm"
          />
        )}
      </Box>,
    );
  }, [submitting, canPost, text, title, theme]);

  useEffect(() => {
    setFooter(
      <Box
        style={[
          Atoms.flex_row,
          Atoms.justify_end,
          Atoms.py_md,
          Atoms.px_lg,
          {
            backgroundColor: theme.palette.background_primary,
            borderTopWidth: 1,
            borderTopColor: withHexOpacity(theme.palette.neutral_500, '20'),
            paddingBottom: 24,
          },
        ]}
      >
        <Text variant="small" color="neutral_500">
          {text.length}/2000
        </Text>
      </Box>,
    );
  }, [text.length, theme]);

  const placeholder = isReply
    ? `Reply to ${truncateName(replyAuthorName, 16)}...`
    : "What's on your mind?";

  return (
    <Box
      style={[
        Atoms.flex_1,
        {
          backgroundColor: theme.palette.background_primary,
          paddingHorizontal: 15,
          paddingTop: 10,
          paddingBottom: 16,
        },
      ]}
    >
      {isReply && (
        <Box
          style={[
            Atoms.p_md,
            Atoms.rounded_md,
            {
              backgroundColor: withHexOpacity(theme.palette.neutral_500, '10'),
              borderBottomWidth: 1,
              borderBottomColor: withHexOpacity(
                theme.palette.neutral_500,
                '20',
              ),
              marginBottom: 10,
            },
          ]}
        >
          <Text variant="small" color="neutral_500">
            Replying to {truncateName(replyAuthorName, 20)}
          </Text>
          <Text
            variant="secondary"
            color="neutral_500"
            numberOfLines={2}
            style={{ marginTop: 2 }}
          >
            {replyContent}
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
  );
}
