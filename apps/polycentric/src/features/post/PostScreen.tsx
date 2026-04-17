import { BackButton, Text } from '@/src/common/components';
import { Screen } from '@/src/common/components/layout';
import { Routes } from '@/src/common/constants';
import {
  decodePostEvent,
  publicKeyToStringURLSafe,
  useCurrentIdentity,
  usePolycentricContext,
  useStore,
} from '@/src/common/lib/polycentric-hooks';
import { SheetMenu } from '@/src/common/lib/sheet';
import { Atoms } from '@/src/common/theme';
import { ComposeSheetInner } from '@/src/features/composer/ComposeSheetInner';
import { ConversationView } from '@/src/features/post/ConversationView';
import { types } from '@polycentric/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

export default function FeedPostScreen() {
  const { postId, replyTo } = useLocalSearchParams<{
    postId: string;
    replyTo?: string;
  }>();

  const { store } = usePolycentricContext();
  const { publicKey: myPublicKey } = useCurrentIdentity();
  const composeOpen = !!replyTo;

  const replyToEvent = useStore(store, (s) =>
    replyTo ? (s.posts[replyTo]?.signedEvent ?? null) : null,
  );

  const handlePostPress = useCallback((nextPostId: string) => {
    router.replace(Routes.tabs.post(nextPostId));
  }, []);

  const handleAuthorPress = useCallback((publicKey: types.PublicKey) => {
    router.replace(Routes.tabs.profile(publicKeyToStringURLSafe(publicKey)));
  }, []);

  const handleReply = useCallback(
    (signedEvent: types.SignedEvent) => {
      const decoded = decodePostEvent(signedEvent);
      if (!decoded?.id || !postId) return;
      router.setParams({ replyTo: decoded.id });
    },
    [postId],
  );

  const handleComposeClose = useCallback(() => {
    router.setParams({ replyTo: '' });
  }, []);

  const handlePostCreated = useCallback(
    async (signedEvent: types.SignedEvent) => {
      const decoded = decodePostEvent(signedEvent);
      if (decoded) {
        store.getState().ingestPost(decoded.id, signedEvent, decoded);
        router.replace(Routes.tabs.post(decoded.id));
      }
    },
    [store],
  );

  const handleAvatarPress = useCallback(() => {
    if (myPublicKey) {
      router.push(Routes.tabs.profile(publicKeyToStringURLSafe(myPublicKey)));
    }
  }, [myPublicKey]);

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  if (!postId) {
    return (
      <Screen>
        <Screen.PrimaryColumn>
          <View style={[Atoms.mx_lg, Atoms.mt_lg]}>
            <BackButton onPress={handleBack} />
            <View style={Atoms.mt_lg}>
              <Text>Invalid post reference</Text>
            </View>
          </View>
        </Screen.PrimaryColumn>
      </Screen>
    );
  }

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={[Atoms.mx_lg, Atoms.mt_lg]}>
          <BackButton onPress={handleBack} />
        </View>
        <View style={[Atoms.flex_1, Atoms.mt_md]}>
          <ConversationView
            postId={postId}
            onPostPress={handlePostPress}
            onAuthorPress={handleAuthorPress}
            onReply={handleReply}
          />
        </View>
        {composeOpen && (
          <SheetMenu onClose={handleComposeClose} detents={[0.82]} scrollable>
            {(dismissSheet) => (
              <ComposeSheetInner
                dismissSheet={dismissSheet}
                onPostCreated={handlePostCreated}
                onAvatarPress={handleAvatarPress}
                replyToEvent={replyToEvent}
              />
            )}
          </SheetMenu>
        )}
      </Screen.PrimaryColumn>
    </Screen>
  );
}
