import SCENE_SPLASH from '@/src/common/assets/images/harbor-scene-splash.svg';
import Icon from '@/src/common/components/Icon';
import { Button, IconButton, Text } from '@/src/common/components/primitives';
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
import { Image } from 'expo-image';
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

  const mode = useIdentitySwitcherStore((state) => state.mode);
  const close = useIdentitySwitcherStore((state) => state.close);
  const toggleMode = useIdentitySwitcherStore((state) => state.toggleMode);
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

  const isAdding = mode === 'adding';

  return (
    <Sheet
      open={mode !== 'closed'}
      onClose={close}
      detents={[0.5, 0.9]}
      header={
        <Sheet.Header
          title={isAdding ? 'Add identity' : 'Identities'}
          onClose={close}
          right={
            <IconButton
              icon={(props) => (
                <Icon
                  name={isAdding ? 'accountSwitch' : 'personAddOutline'}
                  {...props}
                />
              )}
              accessibilityLabel={isAdding ? 'Switch identity' : 'Add identity'}
              variant="ghost"
              size="md"
              disabled={switchingIdentity !== null}
              // IconButton doesn't dim itself when disabled.
              style={switchingIdentity !== null && { opacity: 0.5 }}
              onPress={toggleMode}
            />
          }
        />
      }
    >
      <Sheet.Content style={{ padding: 0 }}>
        <View
          // Maintain a reasonable size on all platforms.
          style={isWeb ? { height: 'clamp(360px, 60vh, 560px)' } : Atoms.flex_1}
        >
          {isAdding ? (
            <AddIdentityForm onAction={close} />
          ) : (
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
          )}
        </View>
      </Sheet.Content>
    </Sheet>
  );
}

/** Sheet content for adding a new identity. */
function AddIdentityForm({ onAction }: { onAction: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View>
      <Image
        source={SCENE_SPLASH}
        contentFit="cover"
        contentPosition={{ top: 0, left: 'center' }}
        style={{ width: '100%', height: 150 }}
      />
      <View
        style={[
          Atoms.p_lg,
          Atoms.gap_md,
          { paddingBottom: insets.bottom + Spacing.lg },
        ]}
      >
        <Text>Add a new identity to this device</Text>
        <View style={Atoms.gap_sm}>
          <Button
            title="Create new identity"
            variant="primary"
            fullWidth
            href={Routes.onboarding.signup.index}
            onPress={onAction}
          />
          <Button
            title="Use existing identity"
            variant="tertiary"
            fullWidth
            href={Routes.onboarding.login}
            onPress={onAction}
          />
        </View>
      </View>
    </View>
  );
}
