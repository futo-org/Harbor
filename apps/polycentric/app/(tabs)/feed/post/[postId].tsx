import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Box } from '@/components/layouts';
import { Text, BackButton, ComposeSheetInner } from '@/components';
import { ConversationView } from '@/components/feed';
import { types } from '@polycentric/react-native';
import {
  decodePostEvent,
  publicKeyToStringURLSafe,
  useCurrentIdentity,
  usePolycentricContext,
} from '@/lib/polycentric-hooks';
import { Routes } from '@/constants';
import { useSheet } from '@/lib/sheet';

export default function PostScreen() {
  const router = useRouter();
  const { store } = usePolycentricContext();
  const { publicKey: myPublicKey } = useCurrentIdentity();
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { Sheet, present, dismiss } = useSheet();

  const [replyToEvent, setReplyToEvent] = useState<types.SignedEvent | null>(
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
    (publicKey: types.PublicKey) => {
      router.replace(Routes.profile(publicKeyToStringURLSafe(publicKey)));
    },
    [router],
  );

  const handleReply = useCallback(
    (se: types.SignedEvent) => {
      setReplyToEvent(se);
      present();
    },
    [present],
  );

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
      <Sheet detents={[0.82]}>
        <ComposeSheetInner
          dismiss={dismiss}
          onPostCreated={handlePostCreated}
          onAvatarPress={() => {
            if (myPublicKey) handleAuthorPress(myPublicKey);
          }}
          replyToEvent={replyToEvent}
        />
      </Sheet>
    </Screen>
  );
}
