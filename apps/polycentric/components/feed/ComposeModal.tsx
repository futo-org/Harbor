import { useState, useEffect, useRef } from 'react';
import {
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  Animated,
  StyleSheet,
} from 'react-native';
import { Box } from '@/components/layouts';
import {
  Avatar,
  Text,
  TextInput,
  LinkButton,
  PubkeyTag,
  Button,
} from '@/components/primitives';
import {
  usePolycentric,
  useCurrentIdentity,
  useUsername,
  identiconUrl,
  truncateName,
  decodePostEvent,
  getPointer,
} from '@/lib/polycentric-hooks';
import { types } from '@polycentric/react-native';
import { useTheme } from '@/theme';

interface ComposeModalProps {
  visible: boolean;
  onClose: () => void;
  onPostCreated: (signedEvent: types.SignedEvent) => void;
  onAvatarPress?: () => void;
  replyToEvent?: types.ISignedEvent | null;
}

export function ComposeModal({
  visible,
  onClose,
  onPostCreated,
  onAvatarPress,
  replyToEvent,
}: ComposeModalProps) {
  const client = usePolycentric();
  const { publicKey } = useCurrentIdentity();
  const username = useUsername(publicKey ?? types.PublicKey.create());
  const avatarUrl = publicKey ? identiconUrl(publicKey) : undefined;
  const { theme } = useTheme();

  const replyDecoded = replyToEvent ? decodePostEvent(replyToEvent) : null;
  const replyPointer = replyToEvent ? getPointer(client, replyToEvent) : null;
  const replyAuthorPubkey =
    replyDecoded?.authorPublicKey ?? types.PublicKey.create();
  const replyAuthorName = useUsername(replyAuthorPubkey);
  const replyContent = replyDecoded?.content ?? '';

  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0.7,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(300);
    }
  }, [visible, fadeAnim, slideAnim]);

  const animateClose = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setText('');
      setError(null);
      onClose();
    });
  };

  const handleClose = () => {
    if (!submitting) animateClose();
  };

  const handlePost = async () => {
    if (!text.trim() || submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      let reference: types.IReference | undefined;
      if (replyPointer) {
        reference = types.Reference.create({
          referenceType: 2,
          reference: types.Pointer.encode(replyPointer).finish(),
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
      animateClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const canPost = text.trim().length > 0 && !submitting;
  const isReply = !!replyToEvent;
  const title = isReply ? 'Reply' : 'New Post';
  const placeholder = isReply
    ? `Reply to ${truncateName(replyAuthorName, 16)}...`
    : "What's on your mind?";

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose}>
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: '#000', opacity: fadeAnim },
            ]}
          />
        </Pressable>

        <Animated.View
          style={[
            styles.content,
            {
              backgroundColor: theme.colors.backgroundPrimary,
              borderTopColor: theme.colors.neutralSurfaceOpacity20,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Header */}
          <Box
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
            padding="md"
            style={{
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.neutralSurfaceOpacity20,
            }}
          >
            <LinkButton
              title="Cancel"
              onPress={handleClose}
              disabled={submitting}
              color={submitting ? 'neutralSurface' : 'primary'}
            />
            <Text variant="body" fontWeight="semibold">
              {title}
            </Text>
            {submitting ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Button
                title="Post"
                onPress={handlePost}
                variant={canPost ? 'primary' : 'disabled'}
                size="sm"
              />
            )}
          </Box>

          {/* Reply context */}
          {isReply && (
            <Box
              padding="md"
              style={{
                backgroundColor: theme.colors.neutralSurfaceOpacity10,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.neutralSurfaceOpacity20,
              }}
            >
              <Text variant="small" color="neutralSurface">
                Replying to {truncateName(replyAuthorName, 20)}
              </Text>
              <Text
                variant="secondary"
                color="neutralSurface"
                numberOfLines={2}
                style={{ marginTop: 2 }}
              >
                {replyContent}
              </Text>
            </Box>
          )}

          {/* Error */}
          {error && (
            <Box
              padding="md"
              style={{
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.destructiveOpacity80,
              }}
            >
              <Text variant="secondary" color="destructive">
                {error}
              </Text>
            </Box>
          )}

          {/* User + input */}
          <Box flex={1} style={{ paddingHorizontal: 15, paddingTop: 10 }}>
            <Box flexDirection="row" gap="md" flex={1}>
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
              <Box flex={1}>
                {/* Header: name + pubkey */}
                <Box
                  flexDirection="row"
                  gap="xs"
                  style={{ alignItems: 'baseline', marginTop: -1 }}
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
                    paddingTop: 4,
                    fontSize: 15,
                    flex: 1,
                  }}
                />
              </Box>
            </Box>
          </Box>

          {/* Footer */}
          <Box
            padding="md"
            flexDirection="row"
            justifyContent="flex-end"
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.neutralSurfaceOpacity20,
              paddingBottom: 24,
            }}
          >
            <Text variant="small" color="neutralSurface">
              {text.length}/2000
            </Text>
          </Box>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  content: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    minHeight: 360,
    maxHeight: '85%',
    borderTopWidth: 1,
  },
});
