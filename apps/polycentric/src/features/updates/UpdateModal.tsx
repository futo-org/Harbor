import { useEffect, useState } from 'react';
import { Linking, Modal, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Spacing, useTheme } from '@/src/common/theme';
import { Button, Text } from '@/src/common/components';
import * as Application from 'expo-application';

export interface LatestRelease {
  buildNumber: number;
  version: string;
  apkUrl: string;
}

export async function fetchLatestRelease(): Promise<LatestRelease> {
  return {
    buildNumber: 42,
    version: 'v2.0.9',
    apkUrl:
      'https://gitlab.futo.org/polycentric/polycentric/-/releases/v2.0.9/downloads/polycentric-android.apk',
  };
}

export function UpdateModal() {
  const [availableRelease, setAvailableRelease] =
    useState<LatestRelease | null>(null);
  const { theme } = useTheme();

  const onUpdateNow = () => {
    if (!availableRelease) return;
    Linking.openURL(availableRelease.apkUrl);
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    void fetchLatestRelease().then((release) => {
      const installedBuildNumber = Number(Application.nativeBuildVersion);
      if (
        Number.isNaN(installedBuildNumber) ||
        release.buildNumber <= installedBuildNumber
      ) {
        return;
      }

      setAvailableRelease(release);
    });
  }, []);

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => setAvailableRelease(null)}
      presentationStyle="fullScreen"
      visible={availableRelease !== null}
    >
      <SafeAreaView style={[{ flex: 1 }, theme.atoms.bg]}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 320,
              gap: Spacing['4xl'],
            }}
          >
            <View style={{ gap: Spacing.md }}>
              <Text variant="title" fontSize={32} lineHeight={32}>
                New Update
                {'\n'}
                Available
              </Text>

              <Text>
                New Android APK version available. Version{' '}
                {availableRelease?.version} is now ready to install.
              </Text>
            </View>

            <View style={{ width: '100%', gap: Spacing.sm }}>
              <Button title="Update Now" fullWidth onPress={onUpdateNow} />
              <Button
                variant="tertiary"
                title="Dismiss"
                fullWidth
                onPress={() => setAvailableRelease(null)}
              />
            </View>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
