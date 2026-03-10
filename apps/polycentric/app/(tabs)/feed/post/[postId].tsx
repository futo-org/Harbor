import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Box } from '@/components/layouts';
import { Text, BackButton, ComposeModal } from '@/components';
import { ConversationView } from '@/components/feed';
import { types } from '@polycentric/react-native';
import {
  decodePostEvent,
  publicKeyToStringURLSafe,
  useCurrentIdentity,
  usePolycentricContext,
} from '@/lib/polycentric-hooks';
import { Routes } from '@/constants';

export default function PostScreen() {
  const router = useRouter();
  const { store } = usePolycentricContext();
  const { publicKey: myPublicKey } = useCurrentIdentity();
  const { postId } = useLocalSearchParams<{ postId: string }>();

  const [composeVisible, setComposeVisible] = useState(false);
  const [replyToEvent, setReplyToEvent] = useState<types.ISignedEvent | null>(
    null,
  );

  const handlePostPress = useCallback(
    (postId: string) => {
      // Using replace(): push() is a better user experience but needs careful management.
      router.replace(Routes.post(postId));
    },
    [router],
  );

  const handleAuthorPress = useCallback(
    (publicKey: types.IPublicKey) => {
      router.replace(Routes.profile(publicKeyToStringURLSafe(publicKey)));
    },
    [router],
  );

  const handleReply = useCallback((se: types.ISignedEvent) => {
    setReplyToEvent(se);
    setComposeVisible(true);
  }, []);

  const handlePostCreated = useCallback(
    (se: types.SignedEvent) => {
      const decoded = decodePostEvent(se);
      if (decoded) {
        store.getState().ingestPost(decoded.id, se, decoded);
        router.replace(Routes.post(decoded.id));
      }
    },
    [router, store],
  );

  if (!postId) {
    return (
      <Screen>
        <Box marginHorizontal="lg" marginTop="lg">
          <BackButton onPress={() => router.back()} />
          <Box marginTop="lg">
            <Text>Invalid post reference</Text>
          </Box>
        </Box>
      </Screen>
    );
  }

  return (
    <Screen>
      <Box marginHorizontal="lg" marginTop="lg">
        <BackButton onPress={() => router.back()} />
      </Box>
      <Box flex={1} marginTop="md">
        <ConversationView
          postId={postId}
          onPostPress={handlePostPress}
          onAuthorPress={handleAuthorPress}
          onReply={handleReply}
        />
      </Box>
      <ComposeModal
        visible={composeVisible}
        onClose={() => {
          setComposeVisible(false);
          setReplyToEvent(null);
        }}
        onPostCreated={handlePostCreated}
        onAvatarPress={() => {
          if (myPublicKey) handleAuthorPress(myPublicKey);
        }}
        replyToEvent={replyToEvent}
      />
    </Screen>
  );
}
