import { Screen } from '@/src/common/components/layout';
import { Routes } from '@/src/common/constants';
import { DismissReason } from '@/src/common/lib/sheet';
import { types } from '@polycentric/react-native';
import { router, useNavigation } from 'expo-router';
import { useCallback } from 'react';
import { ComposeSheetInner } from './ComposeSheetInner';

// Full-screen composer used by the detached "compose" native tab item (iOS).
// Unlike the reply/quote composer at /feed/compose, this is a real tab
// destination rather than a bottom sheet, so there's no transparent modal to
// dismiss into an empty screen. "Dismissing" here means leaving the compose
// tab and returning to the tab the user came from (backBehavior="history" on
// the navigator — see app/(tabs)/_layout.tsx).
export default function ComposeTabScreen() {
  const navigation = useNavigation();

  const dismissSheet = useCallback(
    async (_reason?: DismissReason) => {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        router.replace(Routes.tabs.feed.index);
      }
    },
    [navigation],
  );

  const handlePostCreated = useCallback(
    async (_signedEvent: types.SignedEvent) => {
      // TODO: decode sequence from the new v2 SignedEvent and navigate to
      // the created post's route.
    },
    [],
  );

  return (
    <Screen keyboardAvoiding>
      <Screen.PrimaryColumn>
        <ComposeSheetInner
          dismissSheet={dismissSheet}
          onPostCreated={handlePostCreated}
        />
      </Screen.PrimaryColumn>
    </Screen>
  );
}
