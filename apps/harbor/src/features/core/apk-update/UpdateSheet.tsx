import { Button, Text } from '@/src/common/components/primitives';
import { Sheet } from '@/src/common/components/sheet';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { cancelApkDownload, downloadAndInstallApk } from './downloadApk';
import { ReleaseNotes } from './ReleaseNotes';
import { useUpdateStore } from './hooks/useUpdateStore';
import { isWeb } from '@/src/common/util/platform';

function ProgressBar({ progress }: { progress: number | null }) {
  const { theme } = useTheme();

  if (progress == null) {
    return <ActivityIndicator size="small" color={theme.palette.neutral_500} />;
  }

  return (
    <View
      accessibilityRole="progressbar"
      style={[
        Atoms.w_full,
        Atoms.rounded_md,
        Atoms.overflow_hidden,
        { height: 6, backgroundColor: theme.palette.neutral_100 },
      ]}
    >
      <View
        style={{
          width: `${Math.round(progress * 100)}%`,
          height: '100%',
          backgroundColor: theme.palette.primary_500,
        }}
      />
    </View>
  );
}

/** Offers the available update: release notes, download progress, and the
 *  install hand-off. */
export function UpdateSheet() {
  const { theme } = useTheme();
  const [footerHeight, setFooterHeight] = useState(0);
  const available = useUpdateStore((s) => s.available);
  const sheetOpen = useUpdateStore((s) => s.sheetOpen);
  const phase = useUpdateStore((s) => s.phase);
  const progress = useUpdateStore((s) => s.progress);
  const error = useUpdateStore((s) => s.error);
  const closeSheet = useUpdateStore((s) => s.closeSheet);
  const skipAvailableVersion = useUpdateStore((s) => s.skipAvailableVersion);

  if (!available) return null;

  return (
    <Sheet
      open={sheetOpen}
      onClose={closeSheet}
      detents={[0.6, 1]}
      dismissible={false}
      header={<Sheet.Header title="Update available" onClose={closeSheet} />}
      footer={
        <Sheet.Footer
          fadeTop
          onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
          left={
            phase === 'downloading' ? (
              <View style={[Atoms.gap_md, Atoms.items_center, Atoms.w_full]}>
                <ProgressBar progress={progress} />
                <Button
                  title="Cancel"
                  variant="tertiary"
                  fullWidth
                  onPress={cancelApkDownload}
                />
              </View>
            ) : phase === 'installing' ? (
              <View style={[Atoms.gap_md, Atoms.items_center]}>
                <ActivityIndicator
                  size="small"
                  color={theme.palette.neutral_500}
                />
                <Text
                  variant="secondary"
                  style={theme.atoms.text_neutral_medium}
                >
                  Waiting for the installer…
                </Text>
              </View>
            ) : (
              <View style={Atoms.gap_sm}>
                <Button
                  title={
                    phase === 'error' ? 'Try again' : 'Download and install'
                  }
                  icon="download"
                  fullWidth
                  onPress={() => void downloadAndInstallApk(available)}
                />
                <Button
                  title="Skip this version"
                  variant="tertiary"
                  fullWidth
                  onPress={skipAvailableVersion}
                />
                <Button
                  title="Later"
                  variant="tertiary"
                  fullWidth
                  onPress={closeSheet}
                />
              </View>
            )
          }
        />
      }
    >
      <Sheet.Content
        // Native footers overlay the content (web's sits below it). The full
        // height, safe area included, is on purpose: Android ignores TrueSheet's
        // own inset when deciding whether to scroll, so less leaves a dead zone.
        style={{ paddingBottom: Spacing.lg + (isWeb ? 0 : footerHeight) }}
      >
        <View style={Atoms.gap_lg}>
          <Text variant="title" fontWeight="semibold">
            Harbor v{available.versionName}
          </Text>
          {available.notes ? <ReleaseNotes notes={available.notes} /> : null}
          {phase === 'error' && error ? (
            <Text variant="secondary" color="negative_500">
              {error}
            </Text>
          ) : null}
        </View>
      </Sheet.Content>
    </Sheet>
  );
}
