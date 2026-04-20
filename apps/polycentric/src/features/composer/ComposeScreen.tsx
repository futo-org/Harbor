import { SheetMenu } from '@/src/common/lib/sheet';
import { usePostById } from '@/src/features/post/hooks/usePostById';
import { types } from '@polycentric/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ComposeSheetInner } from './ComposeSheetInner';

export default function ComposeScreen() {
  const params = useLocalSearchParams<{ replyTo?: string }>();

  // replyTo is an `identityId/sequence` path — the same identifier pair
  // `Routes.tabs.post` uses.
  const [replyToIdentity, replyToSequence] = params.replyTo?.split('/') ?? [];
  const { post: replyTo } = usePostById(replyToIdentity, replyToSequence);

  console.log(replyTo);

  const handlePostCreated = useCallback(
    async (_signedEvent: types.SignedEvent) => {
      // TODO: decode sequence from the new v2 SignedEvent and navigate to
      // the created post's route.
    },
    [],
  );

  return (
    <SheetMenu onClose={() => router.back()} detents={[0.82]} scrollable>
      {(dismissSheet) => (
        <ComposeSheetInner
          dismissSheet={dismissSheet}
          onPostCreated={handlePostCreated}
          replyTo={replyTo}
        />
      )}
    </SheetMenu>
  );
}
