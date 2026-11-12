import Icon from '@/src/common/components/Icon';
import { Sheet } from '@/src/common/components/sheet';
import { Routes } from '@/src/common/constants';
import {
  useCurrentIdentity,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, Spacing } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import {
  ProfileRow,
  ProfileRowSkeletonList,
} from '@/src/features/profile/ProfileRow';
import { FetchMode } from '@polycentric/react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { type ReactNode, useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type IdentityRow,
  useIdentitySwitcherStore,
} from './useIdentitySwitcher';

const SKELETON_COUNT = 3;

const keyExtractor = (row: IdentityRow) => row.identity;

/**
 * User-facing identity switcher.
 * This component should be mounted only once.
 * `useIdentitySwitcher()` should be used to interface with it.
 */
export function IdentitySwitcherSheet() {
  const insets = useSafeAreaInsets();

  const client = usePolycentric();
  const { identityKey: activeIdentity } = useCurrentIdentity();

  const isOpen = useIdentitySwitcherStore((state) => state.isOpen);
  const close = useIdentitySwitcherStore((state) => state.close);
  const switchTo = useIdentitySwitcherStore((state) => state.switchTo);
  const rows = useIdentitySwitcherStore((state) => state.rows);
  const switchingIdentity = useIdentitySwitcherStore(
    (state) => state.switchingIdentity,
  );

  const renderItem = useCallback(
    ({ item }: { item: IdentityRow }) => {
      const isActive = item.identity === activeIdentity;

      let trailing: ReactNode = null;
      if (item.identity === switchingIdentity) {
        trailing = <ActivityIndicator />;
      } else if (isActive) {
        trailing = (
          <Icon
            name="personOutline"
            size={20}
            color="primary_500"
            accessibilityLabel="Active identity"
          />
        );
      }

      return (
        <ProfileRow
          identity={item.identity}
          fetchMode={FetchMode.OfflineOnly}
          disabled={switchingIdentity !== null}
          trailing={trailing}
          onPress={() => {
            if (isActive) {
              close();
              router.navigate(Routes.tabs.profile(item.identity));
            } else {
              void switchTo(client, item.login);
            }
          }}
        />
      );
    },
    [activeIdentity, switchingIdentity, close, switchTo, client],
  );

  return (
    <Sheet
      open={isOpen}
      onClose={close}
      detents={[0.5, 0.9]}
      header={<Sheet.Header title="Identities" onClose={close} />}
    >
      <Sheet.Content style={{ padding: 0 }}>
        <View
          // Maintain a reasonable size on all platforms.
          style={isWeb ? { height: 'clamp(360px, 60vh, 560px)' } : Atoms.flex_1}
        >
          <FlashList
            data={rows ?? []}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            extraData={switchingIdentity}
            ListFooterComponent={
              rows === null ? (
                <ProfileRowSkeletonList count={SKELETON_COUNT} />
              ) : null
            }
            contentContainerStyle={{
              paddingBottom: insets.bottom + Spacing.lg,
            }}
          />
        </View>
      </Sheet.Content>
    </Sheet>
  );
}
