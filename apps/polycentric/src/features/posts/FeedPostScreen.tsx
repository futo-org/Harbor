import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Box } from '@/src/common/components/layouts';
import { Text, BackButton } from '@/src/common/components';
import { ComposeSheetInner } from '@/src/features/composer/ComposeSheetInner';
import { ConversationView } from '@/src/features/posts/ConversationView';
import { types } from '@polycentric/react-native';
import {
  decodePostEvent,
  publicKeyToStringURLSafe,
  useCurrentIdentity,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';
import { Routes } from '@/src/common/constants';
import { useSheet } from '@/src/common/lib/sheet';
import { Atoms } from '@/src/common/theme';

export default function FeedPostScreen() {
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
        <Box style={[Atoms.mx_lg, Atoms.mt_lg]}>
          <BackButton onPress={() => router.back()} />
          <Box style={Atoms.mt_lg}>
            <Text>Invalid post reference</Text>
          </Box>
        </Box>
      </Screen>
    );
  }

  return (
    <Screen>
      <Box style={[Atoms.mx_lg, Atoms.mt_lg]}>
        <BackButton onPress={() => router.back()} />
      </Box>
      <Box style={[Atoms.flex_1, Atoms.mt_md]}>
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
