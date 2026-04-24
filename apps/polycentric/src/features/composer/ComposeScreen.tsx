import { SheetMenu } from '@/src/common/lib/sheet';
import { Routes } from '@/src/common/constants';
import { usePostById } from '@/src/features/post/hooks/usePostById';
import { types } from '@polycentric/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ComposeSheetInner } from './ComposeSheetInner';

export default function ComposeScreen() {
  const params = useLocalSearchParams<{ replyTo?: string; attach?: string }>();

  // replyTo is an `identityId/sequence` path — the same identifier pair
  // `Routes.tabs.post` uses.
  const [replyToIdentity, replyToSequence] = params.replyTo?.split('/') ?? [];
  const { post: replyTo } = usePostById(replyToIdentity, replyToSequence);

  const attachOnMount = params.attach === '1';

  const handlePostCreated = useCallback(
    async (_signedEvent: types.SignedEvent) => {
      // TODO: decode sequence from the new v2 SignedEvent and navigate to
      // the created post's route.
    },
    [],
  );

  const handleClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(Routes.tabs.feed.index);
    }
  }, []);

  return (
    <SheetMenu onClose={handleClose} detents={[0.82]} scrollable>
      {(dismissSheet) => (
        <ComposeSheetInner
          dismissSheet={dismissSheet}
          onPostCreated={handlePostCreated}
          replyTo={replyTo}
          attachOnMount={attachOnMount}
        />
      )}
    </SheetMenu>
  );
}
