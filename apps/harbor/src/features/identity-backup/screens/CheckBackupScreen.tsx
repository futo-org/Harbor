import { Button, Screen, ScreenHeader, Text } from '@/src/common/components';
import { usePolycentricContext } from '@/src/common/lib/polycentric-hooks';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { decodeIdentityBackup } from '@/src/features/identity-backup/backup';
import {
  BackupFilePicker,
  type PickedBackupFile,
} from '@/src/features/identity-backup/components/BackupFilePicker';
import { BackupStatus } from '@/src/features/identity-backup/components/BackupStatus';
import type { PolycentricClient } from '@polycentric/react-native';
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Indicates a stage in the check backup flow. */
type CheckStage = 'input' | 'success' | 'failure';

/**
 * Whether `backupData` is a backup that could restore `identityKey`.
 */
function matchesBackup(
  client: PolycentricClient,
  identityKey: string | undefined,
  backupData: string,
): boolean {
  if (!identityKey) return false;

  const backup = decodeIdentityBackup(backupData);
  if (!backup?.recoveryKey) return false;
  if (backup.identityKey !== identityKey) return false;

  client.identityManager.copyBackupEvents(backup);

  return client.identityManager.checkRecoveryKey(
    backup.recoveryKey,
    backup.identityKey,
  );
}

/**
 * Checks a backup file against the identity it claims to restore.
 */
export default function CheckBackupScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const { client, currentIdentity } = usePolycentricContext();

  const [stage, setStage] = useState<CheckStage>('input');
  const [picked, setPicked] = useState<PickedBackupFile>();

  const onPress = () => {
    if (stage !== 'input') return router.back();
    if (!picked) return;

    setStage(
      matchesBackup(client, currentIdentity?.identityKey, picked.contents)
        ? 'success'
        : 'failure',
    );
  };

  const buttonTitle = stage === 'input' ? 'Check' : 'Done';
  const buttonDisabled = stage === 'input' && !picked;

  let innerContent: ReactNode = null;
  if (stage === 'input') {
    innerContent = <BackupFilePicker picked={picked} onPicked={setPicked} />;
  } else {
    innerContent = (
      <BackupStatus
        successful={stage === 'success'}
        message={
          stage === 'success'
            ? 'This backup file can restore your identity.'
            : 'This backup file is unable to restore your identity.'
        }
      />
    );
  }

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View
          style={[
            Atoms.px_lg,
            Atoms.flex_1,
            Atoms.gap_md,
            { backgroundColor: theme.atoms.bg.backgroundColor },
          ]}
        >
          <ScreenHeader title="Test Backup" onBack={() => router.back()} />

          <ScrollView
            // Fit the scrollview to the parent
            style={Atoms.flex_1}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              Atoms.gap_md,
              { paddingBottom: insets.bottom + Spacing['4xl'] },
            ]}
          >
            {stage === 'input' && (
              <View style={Atoms.gap_sm}>
                <Text variant="title">Check your backup</Text>
                <Text variant="body" color="neutral_500">
                  Check whether an identity backup file can correctly restore
                  this identity.
                </Text>
              </View>
            )}

            {innerContent}

            <View style={Atoms.mt_sm}>
              <Button
                title={buttonTitle}
                variant="tertiary"
                fullWidth
                disabled={buttonDisabled}
                onPress={onPress}
              />
            </View>
          </ScrollView>
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
