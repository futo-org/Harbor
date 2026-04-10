import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
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
import { webSafeRouterBack } from '@/src/common/navigation/webSafeRouterBack';
import { useSheet } from '@/src/common/lib/sheet';
import { Atoms } from '@/src/common/theme';

export default function FeedPostScreen() {
  const { store } = usePolycentricContext();
  const { publicKey: myPublicKey } = useCurrentIdentity();
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { Sheet, present } = useSheet();

  const [replyToEvent, setReplyToEvent] = useState<types.SignedEvent | null>(
    null,
  );

  const handlePostPress = useCallback((postId: string) => {
    // Using replace(): push() is a better user experience but needs careful management.
    router.replace(Routes.post(postId));
  }, []);

  const handleAuthorPress = useCallback((publicKey: types.PublicKey) => {
    router.replace(Routes.profile(publicKeyToStringURLSafe(publicKey)));
  }, []);

  const handleReply = useCallback(
    (se: types.SignedEvent) => {
      const decoded = decodePostEvent(se);
      if (!decoded?.id) return;
      setReplyToEvent(se);
      void present();
    },
    [present],
  );

  const handleBack = useCallback(() => {
    webSafeRouterBack();
  }, []);

  const handlePostCreated = useCallback(
    (se: types.SignedEvent) => {
      const decoded = decodePostEvent(se);
      if (decoded) {
        store.getState().ingestPost(decoded.id, se, decoded);
        router.replace(Routes.post(decoded.id));
      }
    },
    [store],
  );

  if (!postId) {
    return (
      <Screen>
        <Box style={[Atoms.mx_lg, Atoms.mt_lg]}>
          <BackButton onPress={handleBack} />
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
        <BackButton onPress={handleBack} />
      </Box>
      <Box style={[Atoms.flex_1, Atoms.mt_md]}>
        <ConversationView
          postId={postId}
          onPostPress={handlePostPress}
          onAuthorPress={handleAuthorPress}
          onReply={handleReply}
        />
      </Box>
      <Sheet detents={[0.82]} scrollable>
        <ComposeSheetInner
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
