import { SheetMenu } from '@/src/common/lib/sheet';
import { Routes } from '@/src/common/constants';
import { usePostById } from '@/src/features/post/hooks/usePostById';
import { types, v2 } from '@polycentric/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ComposeSheetInner } from './ComposeSheetInner';
import { hexToBytes } from '@/src/common/lib/polycentric-hooks';
import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';

export default function ComposeScreen() {
  const params = useLocalSearchParams<{ replyTo?: string; attach?: string }>();

  const replyToEventKey = params.replyTo
    ? v2.EventKey.fromBinary(hexToBytes(params.replyTo))
    : undefined;

  const { post: replyTo } = usePostById(
    replyToEventKey?.identity,
    getKeyFingerprint(replyToEventKey?.signedBy),
    replyToEventKey?.sequence,
  );

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
