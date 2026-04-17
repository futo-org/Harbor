import { Routes } from '@/src/common/constants';
import {
  decodePostEvent,
  publicKeyToStringURLSafe,
  useCurrentIdentity,
  usePolycentricContext,
  useStore,
} from '@/src/common/lib/polycentric-hooks';
import { SheetMenu } from '@/src/common/lib/sheet';
import { types } from '@polycentric/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { ComposeSheetInner } from './ComposeSheetInner';

export default function ComposeSheetRoute() {
  const { store } = usePolycentricContext();
  const { publicKey: myPublicKey } = useCurrentIdentity();
  const params = useLocalSearchParams<{ replyTo?: string }>();
  const replyToPostId = params.replyTo;

  useEffect(() => {
    if (!replyToPostId) return;
    if (store.getState().posts[replyToPostId]?.signedEvent) return;
    void store.getState().loadPostPage(replyToPostId);
  }, [replyToPostId, store]);

  const replyToEvent = useStore(store, (s) =>
    replyToPostId ? (s.posts[replyToPostId]?.signedEvent ?? null) : null,
  );

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

  return (
    <SheetMenu onClose={() => router.back()} detents={[0.82]} scrollable>
      {(dismissSheet) => (
        <ComposeSheetInner
          dismissSheet={dismissSheet}
          onPostCreated={handlePostCreated}
          onAvatarPress={handleAvatarPress}
          replyToEvent={replyToEvent}
        />
      )}
    </SheetMenu>
  );
}
