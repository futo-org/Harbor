import {
  Button,
  Checkbox,
  ProfileAvatar,
  Screen,
  Text,
} from '@/src/common/components';
import { Routes } from '@/src/common/constants';
import {
  usePolycentric,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

export default function PairingConfirmationScreen() {
  const { theme } = useTheme();
  const { refreshCurrentIdentity } = usePolycentricContext();
  const client = usePolycentric();
  const identityKey = client.pairingSessionManager.pendingClaimIdentityKey;
  const profile = useProfile(identityKey);
  const isRotation = client.pairingSessionManager.pendingClaimIsRotation;

  const [confirming, setConfirming] = useState(false);
  const [shouldSecureRotationKey, setShouldSecureRotationKey] = useState(true);

  useEffect(() => {
    if (!client.pairingSessionManager.pendingClaimIdentityKey) {
      router.replace(Routes.onboarding.index);
    }
  }, []);

  if (!identityKey) return null;
  const displayName = profile.name ?? 'Anon';

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await client.pairingSessionManager.commitPairing(
        isRotation && shouldSecureRotationKey,
      );
      await refreshCurrentIdentity();
      client.pairingSessionManager.clearPendingClaim();
      router.replace(Routes.tabs.feed.index);
    } catch (err) {
      console.warn('Pairing confirmation failed:', err);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View
          style={[
            Atoms.flex_col,
            Atoms.flex_1,
            Atoms.px_lg,
            Atoms.items_center,
            Atoms.justify_center,
            Atoms.gap_2xl,
            { backgroundColor: theme.palette.neutral_0 },
          ]}
        >
          <View style={[Atoms.items_center, Atoms.gap_xs]}>
            <Text variant="title">Confirm Pairing</Text>
          </View>

          <View style={[Atoms.items_center, Atoms.gap_md]}>
            <ProfileAvatar identityKey={identityKey} size="xl" />

            <View style={[Atoms.items_center, Atoms.gap_xs]}>
              <Text
                variant="title"
                numberOfLines={1}
                style={{ textAlign: 'center' }}
              >
                {displayName}
              </Text>
            </View>
          </View>

          <View style={{ width: '100%', maxWidth: 320, gap: 16 }}>
            {isRotation ? (
              <Checkbox
                checked={shouldSecureRotationKey}
                onChange={setShouldSecureRotationKey}
                label="Protect my key"
                disabled={confirming}
              />
            ) : null}
            <Button
              title="Confirm"
              variant="primary"
              fullWidth
              disabled={confirming}
              onPress={() => void handleConfirm()}
            />
          </View>
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
