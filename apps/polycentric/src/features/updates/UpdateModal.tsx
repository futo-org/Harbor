import { useEffect, useState } from 'react';
import { Modal, Platform, View } from 'react-native';
import { fetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import { startActivityAsync } from 'expo-intent-launcher';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Atoms, useTheme } from '@/src/common/theme';
import { Button, Text } from '@/src/common/components';
import * as Application from 'expo-application';

type ApkBuildProfile = 'preview' | 'production-apk';

const RELEASE_URL = process.env.EXPO_PUBLIC_RELEASE_URL;
const BUILD_PROFILE = process.env.EXPO_PUBLIC_BUILD_PROFILE;

export interface LatestRelease {
  buildNumber: number;
  version: string;
  apkUrl: string;
}

export async function fetchLatestRelease(
  buildProfile: ApkBuildProfile,
): Promise<LatestRelease> {
  const response = await fetch(
    `${RELEASE_URL}/android/${buildProfile}/latest.json`,
  );

  if (!response.ok) {
    throw new Error(`Release check failed: ${response.status}`);
  }

  return response.json();
}

export function UpdateModal() {
  const [availableRelease, setAvailableRelease] =
    useState<LatestRelease | null>(null);
  const { theme } = useTheme();

  const onUpdateNow = async () => {
    if (!availableRelease) return;

    const apk = await File.downloadFileAsync(
      availableRelease.apkUrl,
      new File(Paths.cache, 'polycentric-update.apk'),
      { idempotent: true },
    );
    const contentUri = await getContentUriAsync(apk.uri);

    await startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: 1,
      type: 'application/vnd.android.package-archive',
    });
  };

  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !RELEASE_URL ||
      (BUILD_PROFILE !== 'preview' && BUILD_PROFILE !== 'production-apk')
    ) {
      return;
    }

    void fetchLatestRelease(BUILD_PROFILE).then((release) => {
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
          <View style={[Atoms.w_full, Atoms.gap_3xl, { maxWidth: 320 }]}>
            <View style={[Atoms.gap_md]}>
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

            <View style={[Atoms.w_full, Atoms.gap_sm]}>
              <Button
                title="Update Now"
                fullWidth
                onPress={() => void onUpdateNow()}
              />
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
