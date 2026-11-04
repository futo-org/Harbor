import { Button, Screen, ScreenHeader, Text } from '@/src/common/components';
import { usePolycentricContext } from '@/src/common/lib/polycentric-hooks';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import {
  BackupFilePicker,
  type PickedBackupFile,
} from '@/src/features/identity-backup/components/BackupFilePicker';
import { BackupStatus } from '@/src/features/identity-backup/components/BackupStatus';
import { BackupCheck, type PolycentricClient } from '@polycentric/react-native';
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** State for the current stage in the check backup flow */
type CheckState =
  | { stage: 'input' }
  | { stage: 'checking' }
  | { stage: 'success' }
  | { stage: 'failure'; message?: string };

/** Derive the new state from the picked file */
async function checkBackup(
  client: PolycentricClient,
  identityKey: string | undefined,
  backupContents: string,
): Promise<CheckState> {
  if (!identityKey) return { stage: 'failure' };
  switch (await client.checkBackup(backupContents, identityKey)) {
    case BackupCheck.Valid:
      return { stage: 'success' };
    case BackupCheck.Stale:
      return {
        stage: 'failure',
        message: 'This backup file is outdated and should not be used.',
      };
    default:
      return { stage: 'failure' };
  }
}

/**
 * Checks a backup file against the identity it claims to restore.
 */
export default function CheckBackupScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const { client, currentIdentity } = usePolycentricContext();

  const [state, setState] = useState<CheckState>({ stage: 'input' });

  const onPicked = (file: PickedBackupFile) => {
    setState({ stage: 'checking' });
    void checkBackup(client, currentIdentity?.identityKey, file.contents)
      .catch((): CheckState => ({ stage: 'failure' }))
      .then(setState);
  };

  const stage = state.stage;
  const buttonTitle = stage === 'input' ? 'Cancel' : 'Done';

  let innerContent: ReactNode = null;
  if (stage === 'input') {
    innerContent = <BackupFilePicker onPicked={onPicked} />;
  } else if (stage === 'checking') {
    innerContent = null;
  } else {
    let message: string;
    if (stage === 'success') {
      message = 'This backup file can restore your identity.';
    } else {
      message =
        state.message ?? 'This backup file is unable to restore your identity.';
    }

    innerContent = (
      <BackupStatus successful={stage === 'success'} message={message} />
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
                onPress={() => router.back()}
              />
            </View>
          </ScrollView>
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
