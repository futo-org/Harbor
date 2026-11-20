import { Button, Screen, ScreenHeader, Text } from '@/src/common/components';
import { Routes } from '@/src/common/constants/routes';
import { confirm, showAlert } from '@/src/common/lib/dialogs';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import { getPushToken } from '@/src/common/lib/notifications/registerPushToken';
import {
  useCurrentIdentity,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { DEFAULT_NOTIFICATION_SERVERS } from '@/src/common/lib/polycentric-hooks/PolycentricProvider';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { serverHost } from '@/src/features/moderation/serverHost';
import { reloadAppAsync } from 'expo';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ServerRow } from '../servers/ServerRow';

async function restartApp() {
  if (isWeb) {
    window.location.assign(Routes.onboarding.index);
  } else {
    await reloadAppAsync();
  }
}

export default function DeleteIdentityScreen() {
  usePageTitle('Delete Identity');
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const client = usePolycentric();
  const { identityKey } = useCurrentIdentity();

  const [identity] = useState(identityKey);
  const [servers] = useState(() => client.identityServerHistory());
  const [isDeleting, setIsDeleting] = useState(false);
  const remoteDone = useRef(false);

  const back = () =>
    router.canGoBack()
      ? router.back()
      : router.navigate(Routes.tabs.settings.index);

  const deleteRemote = async (): Promise<boolean> => {
    if (remoteDone.current) return true;

    const results = await client.deleteRemoteIdentity();
    const failed = results
      .filter((result) => !result.deleted)
      .map((result) => serverHost(result.server));

    if (failed.length > 0) {
      const proceed = await confirm({
        title: 'Some servers could not be reached',
        message: `${failed.join(', ')} did not confirm the deletion. Cancel to keep your identity on this device and try again later, or continue to remove it from this device anyway. After that, this device can no longer ask those servers to delete it.`,
        confirmText: 'Continue',
        destructive: true,
      });
      if (!proceed) return false;
    }

    remoteDone.current = true;
    return true;
  };

  const removePushSubscriptions = async () => {
    try {
      const token = await getPushToken();
      if (!token) return;
      await client.clearDevicePushSubscriptions(DEFAULT_NOTIFICATION_SERVERS, {
        service: 'expo',
        token,
      });
    } catch (err) {
      console.warn('Removing push subscriptions failed:', err);
    }
  };

  const onDelete = async () => {
    if (!identity || isDeleting) return;

    const confirmed = await confirm({
      title: 'Delete your identity?',
      message:
        'Your identity will be deleted from this device and from your servers. This cannot be undone.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      if (!(await deleteRemote())) return;
      await removePushSubscriptions();
      await client.deleteLocalIdentity(identity);
      await restartApp();
    } catch (err) {
      console.error('Identity deletion failed:', err);
      await showAlert({
        title: 'Deletion did not finish',
        message: 'Something went wrong. Please try again.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!identity) return null;

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={[Atoms.px_lg, Atoms.flex_1, theme.atoms.box.primary.bg]}>
          <ScreenHeader title="Delete Identity" onBack={back} />
          <ScrollView
            style={Atoms.flex_1}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              Atoms.gap_xl,
              { paddingBottom: insets.bottom + Spacing['4xl'] },
            ]}
          >
            <View style={Atoms.gap_sm}>
              <Text variant="title">Delete your identity</Text>
              <Text variant="body" color="muted">
                This removes your profile, your posts and everything else you
                have published with this identity.
              </Text>
            </View>

            <View style={Atoms.gap_sm}>
              <Text variant="subtitle" fontWeight="semibold">
                On this device
              </Text>
              <Text variant="body" color="muted">
                Your keys and all data stored for this identity will be erased,
                and you will be signed out.
              </Text>
            </View>

            <View style={Atoms.gap_sm}>
              <Text variant="subtitle" fontWeight="semibold">
                On your servers
              </Text>
              {servers.length === 0 ? (
                <Text variant="body" color="muted">
                  This identity has no servers, so only this device is affected.
                </Text>
              ) : (
                <>
                  <Text variant="body" color="muted">
                    These servers will be asked to delete everything they store
                    for this identity:
                  </Text>
                  {servers.map((server) => (
                    <ServerRow key={server} server={server} status="active" />
                  ))}
                </>
              )}
            </View>

            <View style={Atoms.gap_sm}>
              <Text variant="subtitle" fontWeight="semibold">
                On your other devices
              </Text>
              <Text variant="body" color="muted">
                If you are signed in to this identity anywhere else, those
                devices keep their own copy and will sync it back to your
                servers. To remove your identity for good, delete it from each
                of those devices as well.
              </Text>
            </View>

            <Text variant="body" color="danger" fontWeight="semibold">
              This cannot be undone.
            </Text>

            <View style={Atoms.gap_sm}>
              <Button
                title={isDeleting ? 'Deleting…' : 'Delete Identity'}
                variant="destructive"
                fullWidth
                disabled={isDeleting}
                onPress={() => void onDelete()}
              />
              <Button
                title="Cancel"
                variant="tertiary"
                fullWidth
                disabled={isDeleting}
                onPress={back}
              />
            </View>
          </ScrollView>
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
