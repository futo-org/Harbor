import {
  Button,
  ProfileAvatar,
  Screen,
  ScreenHeader,
  Text,
} from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { ScrollView } from '@/src/common/components/ScrollView';
import { Routes } from '@/src/common/constants';
import {
  useCurrentIdentity,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { publicKeyToString } from '@polycentric/react-native';
import { useWebHover } from '@/src/common/lib/useWebHover';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import {
  IdentityKeyPair,
  useIdentityKeyPairs,
} from '@/src/features/settings/useIdentityKeyPairs';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

export function IdentitySettingsView({ identityKey }: { identityKey: string }) {
  const client = usePolycentric();
  const { theme } = useTheme();
  const profile = useProfile(identityKey);

  const [nameExpanded, setNameExpanded] = useState(false);
  const [creatingSigningKey, setCreatingSigningKey] = useState(false);

  const { keys, reload } = useIdentityKeyPairs(identityKey);
  const rotationKeys = keys.filter((k) => k.role === 'rotation');
  const signingKeys = keys.filter((k) => k.role === 'signing');

  // A signing key can be created here when this device holds no signing key
  // but does hold a rotation key (the authority needed to add one).
  const hasDeviceSigningKey = signingKeys.some((r) => r.onDevice);
  const hasDeviceRotationKey = rotationKeys.some((r) => r.onDevice);
  const canCreateSigningKey = !hasDeviceSigningKey && hasDeviceRotationKey;

  const hasUnprotectedKey = keys.some((k) => k.onDevice && !k.protected);

  const createSigningKey = async () => {
    setCreatingSigningKey(true);
    try {
      await client.identityManager.createSigningKey();
      // Push the new signing key and its acknowledgment to servers.
      await client.sync();
      await reload();
    } catch (err) {
      console.error('Failed to create signing key:', err);
    } finally {
      setCreatingSigningKey(false);
    }
  };

  const displayName = profile.name;

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View style={[Atoms.flex_1, Atoms.mx_lg]}>
          <ScreenHeader title="Identity" onBack={() => router.back()} />
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[Atoms.gap_xl, Atoms.pb_xl]}
          >
            {/* Hero: avatar + name */}
            <View style={[Atoms.items_center, Atoms.gap_md, { paddingTop: 8 }]}>
              <ProfileAvatar identityKey={identityKey} size="massive" />

              <View style={[Atoms.items_center, Atoms.gap_xs]}>
                <Text
                  variant="title"
                  fontWeight="bold"
                  numberOfLines={nameExpanded ? undefined : 2}
                  ellipsizeMode="tail"
                  style={{ textAlign: 'center' }}
                  onPress={() => setNameExpanded((v) => !v)}
                >
                  {displayName || 'Anonymous'}
                </Text>
              </View>
            </View>

            {/* Details */}
            <View style={Atoms.gap_lg}>
              <View style={Atoms.gap_xs}>
                <Text variant="small" color="neutral_500">
                  IDENTITY
                </Text>
                <Text
                  variant="secondary"
                  fontSize="xs"
                  style={{ fontFamily: 'monospace' }}
                  selectable
                >
                  {identityKey}
                </Text>
              </View>

              <KeySection title="ROTATION KEYS" keys={rotationKeys} />

              <KeySection title="SIGNING KEYS" keys={signingKeys} />

              {canCreateSigningKey && !hasUnprotectedKey ? (
                <View
                  style={[
                    Atoms.flex_row,
                    Atoms.gap_sm,
                    Atoms.p_md,
                    Atoms.rounded_md,
                    {
                      alignItems: 'flex-start',
                      backgroundColor: withHexOpacity(
                        theme.palette.warning_400,
                        '20',
                      ),
                    },
                  ]}
                >
                  <Icon name="warning" size={20} color="warning_400" />
                  <Text
                    variant="secondary"
                    style={[Atoms.flex_1, { minWidth: 0 }]}
                  >
                    Create a signing key to prevent being prompted for every
                    signature.
                  </Text>
                </View>
              ) : null}

              {canCreateSigningKey ? (
                <Button
                  variant="tertiary"
                  title="Create signing key"
                  fullWidth
                  disabled={creatingSigningKey}
                  icon={() => (
                    <Icon name="addOutline" size={20} color="neutral_1000" />
                  )}
                  onPress={createSigningKey}
                />
              ) : null}
            </View>
          </ScrollView>
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}

function KeySection({
  title,
  keys,
}: {
  title: string;
  keys: IdentityKeyPair[];
}) {
  return (
    <View style={Atoms.gap_xs}>
      <Text variant="small" color="neutral_500">
        {title}
      </Text>
      {keys.length === 0 ? (
        <Text variant="secondary" color="neutral_500">
          None
        </Text>
      ) : (
        keys.map((row) => (
          <KeyListItem key={publicKeyToString(row.publicKey)} row={row} />
        ))
      )}
    </View>
  );
}

function KeyListItem({ row }: { row: IdentityKeyPair }) {
  const { theme } = useTheme();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  const tint = theme.palette.neutral_500;
  const keyStr = publicKeyToString(row.publicKey);

  return (
    <Pressable
      onPress={() => router.push(Routes.tabs.settings.keypair(keyStr))}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      style={({ pressed }) => [
        Atoms.flex_row,
        Atoms.gap_sm,
        Atoms.p_sm,
        Atoms.rounded_md,
        {
          alignItems: 'center',
          backgroundColor: withHexOpacity(
            tint,
            pressed ? '40' : hovered ? '30' : '20',
          ),
        },
      ]}
    >
      <Icon
        name={
          !row.onDevice ? 'globe' : row.protected ? 'lockClosed' : 'lockOpen'
        }
        size={24}
        color={
          row.onDevice && row.role === 'rotation' && !row.protected
            ? 'warning_400'
            : 'neutral_500'
        }
      />
      <Text
        variant="secondary"
        fontSize="xs"
        style={[{ fontFamily: 'monospace', minWidth: 0 }, Atoms.flex_1]}
        selectable
      >
        {keyStr}
      </Text>
    </Pressable>
  );
}

export default function IdentitySettingsScreen() {
  const { identityKey } = useCurrentIdentity();

  if (!identityKey) return null;

  return <IdentitySettingsView identityKey={identityKey} />;
}
