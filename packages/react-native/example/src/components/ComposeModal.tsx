import { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { types } from '@polycentric/react-native';
import { usePolycentricContext, truncateName } from '../hooks';
import { COLORS } from '../colors';

export interface CurrentUser {
  avatarUrl?: string;
  username: string;
}

export interface ReplyTo {
  authorName: string;
  content: string;
  pointer: types.IPointer;
}

interface ComposeModalProps {
  visible: boolean;
  onClose: () => void;
  onPostCreated: (signedEvent: types.SignedEvent) => void;
  replyTo?: ReplyTo | null;
  user?: CurrentUser;
}

export function ComposeModal({
  visible,
  onClose,
  onPostCreated,
  replyTo,
  user,
}: ComposeModalProps) {
  const { client } = usePolycentricContext();
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

  const handlePost = async () => {
    if (!text.trim() || submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      let reference: types.IReference | undefined;
      if (replyTo?.pointer) {
        reference = types.Reference.create({
          referenceType: 2,
          reference: types.Pointer.encode(replyTo.pointer).finish(),
        });
      }

      const signedEvent = await client.contentManager.createPost(
        text.trim(),
        undefined,
        reference
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
    if (!submitting) {
      animateClose();
    }
  };

  const canPost = text.trim().length > 0 && !submitting;
  const title = replyTo ? 'Reply' : 'New Post';
  const placeholder = replyTo
    ? `Reply to ${truncateName(replyTo.authorName, 16)}...`
    : "What's on your mind?";

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <TouchableWithoutFeedback onPress={handleClose}>
          <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[styles.content, { transform: [{ translateY: slideAnim }] }]}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} disabled={submitting}>
              <Text
                style={[styles.cancelButton, submitting && styles.disabled]}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={handlePost} disabled={!canPost}>
              {submitting ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Text style={[styles.postButton, !canPost && styles.disabled]}>
                  Post
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {replyTo && (
            <View style={styles.replyContext}>
              <Text style={styles.replyLabel}>
                Replying to {truncateName(replyTo.authorName, 20)}
              </Text>
              <Text style={styles.replyContent} numberOfLines={2}>
                {replyTo.content}
              </Text>
            </View>
          )}

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.userRow}>
            {user && (
              <>
                {user.avatarUrl ? (
                  <Image
                    source={{ uri: user.avatarUrl }}
                    style={styles.userAvatar}
                  />
                ) : (
                  <View
                    style={[styles.userAvatar, styles.userAvatarPlaceholder]}
                  />
                )}
                <Text style={styles.userName}>
                  {truncateName(user.username, 20)}
                </Text>
              </>
            )}
          </View>

          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={COLORS.inkSubtle}
            multiline
            autoFocus
            value={text}
            onChangeText={setText}
            editable={!submitting}
            maxLength={2000}
          />

          <View style={styles.footer}>
            <Text style={styles.charCount}>{text.length}/2000</Text>
          </View>
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
  },
  content: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    minHeight: 300,
    maxHeight: '80%',
    borderTopWidth: 1,
    borderTopColor: COLORS.bgHover,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgHover,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.inkBold,
  },
  cancelButton: {
    fontSize: 17,
    color: COLORS.primary,
  },
  postButton: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.primary,
  },
  disabled: {
    color: COLORS.inkSubtle,
  },
  errorContainer: {
    backgroundColor: COLORS.bgHover,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.danger,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 14,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.bgHover,
    marginRight: 10,
  },
  userAvatarPlaceholder: {
    backgroundColor: COLORS.bgLowContrast,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.inkBold,
  },
  input: {
    flex: 1,
    padding: 16,
    fontSize: 17,
    textAlignVertical: 'top',
    color: COLORS.ink,
  },
  footer: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.bgHover,
    alignItems: 'flex-end',
    paddingBottom: 22,
  },
  charCount: {
    fontSize: 13,
    color: COLORS.inkSubtle,
  },
  replyContext: {
    padding: 12,
    backgroundColor: COLORS.bgHover,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgHover,
  },
  replyLabel: {
    fontSize: 13,
    color: COLORS.inkSubtle,
    marginBottom: 4,
  },
  replyContent: {
    fontSize: 14,
    color: COLORS.ink,
  },
});
