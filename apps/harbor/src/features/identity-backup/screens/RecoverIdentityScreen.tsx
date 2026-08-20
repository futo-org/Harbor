import { Button, Text } from '@/src/common/components';
import { RETURN_TO_PARAM, safeReturnTo } from '@/src/common/constants';
import {
  usePolycentric,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { decodeIdentityBackup } from '@/src/features/identity-backup/backup';
import {
  BackupFilePicker,
  type PickedBackupFile,
} from '@/src/features/identity-backup/components/BackupFilePicker';
import { BackupStatus } from '@/src/features/identity-backup/components/BackupStatus';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

type RecoverStage = 'input' | 'submitting' | 'failure';

/**
 * Sign in to an identity using a backup file.
 */
export default function RecoverIdentityScreen() {
  const client = usePolycentric();
  const { refreshCurrentIdentity } = usePolycentricContext();
  const returnTo = safeReturnTo(
    useLocalSearchParams()[RETURN_TO_PARAM] as string | undefined,
  );

  const [stage, setStage] = useState<RecoverStage>('input');
  const [picked, setPicked] = useState<PickedBackupFile>();

  const onPress = async () => {
    if (stage === 'failure') return setStage('input');
    if (stage !== 'input' || !picked) return;

    setStage('submitting');

    try {
      const backup = decodeIdentityBackup(picked.contents);
      if (!backup) throw new Error('Unable to decode backup file');

      await client.identityManager.recoverIdentity(backup);
    } catch (err: unknown) {
      console.warn('Recovery failed:', err);
      return setStage('failure');
    }

    await refreshCurrentIdentity();
    router.replace(
      returnTo
        ? {
            pathname: '/recover/success',
            params: { [RETURN_TO_PARAM]: returnTo },
          }
        : '/recover/success',
    );
  };

  let buttonTitle: string;
  if (stage === 'input') buttonTitle = 'Recover';
  else if (stage === 'submitting') buttonTitle = 'Recovering…';
  else buttonTitle = 'Try again';

  const buttonDisabled =
    stage === 'submitting' || (stage === 'input' && !picked);

  return (
    <View style={[Atoms.flex_col, Atoms.flex_1, Atoms.gap_lg]}>
      {stage === 'failure' ? (
        <BackupStatus
          successful={false}
          message="Unable to recover identity from this backup file."
        />
      ) : (
        <>
          <Text variant="title">Recover using backup</Text>
          <Text variant="body" color="neutral_500">
            Recover your identity using a backup file exported from Harbor. Use
            this only if none of your devices are logged in to Harbor.
            Otherwise, use the pairing feature instead.
          </Text>
          <BackupFilePicker
            picked={picked}
            disabled={stage !== 'input'}
            onPicked={setPicked}
          />
        </>
      )}

      <Button
        title={buttonTitle}
        variant="primary"
        fullWidth
        disabled={buttonDisabled}
        onPress={() => void onPress()}
      />
    </View>
  );
}
