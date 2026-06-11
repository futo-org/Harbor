import { Button, Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { Sheet } from '@/src/common/components/sheet';
import {
  bytesToHex,
  useCurrentIdentity,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { useIdentityKeyPairs } from '@/src/features/settings/useIdentityKeyPairs';
import { types, publicKeyToString } from '@polycentric/react-native';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

function keyTypeLabel(keyType: number): string {
  return keyType === types.KeyType.ED25519 ? 'Ed25519' : `Unknown (${keyType})`;
}

export default function KeyPairScreen() {
  const { theme } = useTheme();
  const client = usePolycentric();
  const { identityKey } = useCurrentIdentity();
  const { pubkey } = useLocalSearchParams<{ pubkey?: string }>();
  const pubkeyStr = pubkey ?? '';

  const { keys, loading, reload } = useIdentityKeyPairs(identityKey);
  const detail =
    keys.find((k) => publicKeyToString(k.publicKey) === pubkeyStr) ?? null;

  const [protectedAvailable, setProtectedAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [privateKeyHex, setPrivateKeyHex] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [copied, setCopied] = useState<'public' | 'private' | null>(null);

  // Check isProtectedAvailable
  useEffect(() => {
    let cancelled = false;
    void client.keyPairManager.isProtectedAvailable().then((available) => {
      if (!cancelled) setProtectedAvailable(available);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const copy = async (field: 'public' | 'private', value: string) => {
    await Clipboard.setStringAsync(value);
    setCopied(field);
    setTimeout(() => setCopied((c) => (c === field ? null : c)), 1500);
  };

  const toggleProtection = async () => {
    if (!detail || !detail.onDevice) return;
    setBusy(true);
    try {
      await client.keyPairManager.setProtected(
        detail.publicKey,
        !detail.protected,
      );
      // Clear the revealed private key from the UI, requiring a fresh authentication prompt to view it again.
      setPrivateKeyHex(null);
      await reload();
    } catch (err) {
      console.error('Failed to change key protection:', err);
    } finally {
      setBusy(false);
    }
  };

  const revealPrivateKey = async () => {
    if (!detail || !detail.onDevice || privateKeyHex || revealing) {
      return;
    }
    setRevealing(true);
    try {
      const unlocked = await client.keyPairManager.unlock(detail.publicKey);
      if (unlocked?.unlockedPrivateKey) {
        setPrivateKeyHex(bytesToHex(unlocked.unlockedPrivateKey));
      }
    } catch (err) {
      console.error('Failed to reveal private key:', err);
    } finally {
      setRevealing(false);
    }
  };

  return (
    <Sheet detents={[0.5, 1]} dismissible scrollable>
      <Sheet.Header
        title="Key"
        onClose={() => router.canGoBack() && router.back()}
      />
      <Sheet.Content style={[Atoms.gap_xl]}>
        {loading || !detail ? (
          <Text variant="secondary" color="neutral_500">
            {loading ? 'Loading...' : 'Key not found'}
          </Text>
        ) : (
          <>
            <View
              style={[
                Atoms.p_md,
                Atoms.rounded_md,
                Atoms.gap_sm,
                {
                  backgroundColor: withHexOpacity(
                    theme.palette.neutral_500,
                    '20',
                  ),
                },
              ]}
            >
              <View style={Atoms.gap_2xs}>
                <Text variant="small" color="neutral_500">
                  Key type
                </Text>
                <Text variant="secondary">
                  {keyTypeLabel(detail.publicKey.keyType)}
                </Text>
              </View>

              <View style={Atoms.gap_2xs}>
                <View
                  style={[Atoms.flex_row, Atoms.gap_sm, Atoms.items_center]}
                >
                  <Text variant="small" color="neutral_500">
                    Public key
                  </Text>
                  {copied === 'public' ? (
                    <Text variant="small" color="positive_500">
                      Copied
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() =>
                    void copy('public', bytesToHex(detail.publicKey.key))
                  }
                  style={[Atoms.flex_row, Atoms.gap_sm, Atoms.items_center]}
                >
                  <Text
                    variant="secondary"
                    fontSize="sm"
                    style={[
                      { fontFamily: 'monospace', minWidth: 0 },
                      Atoms.flex_1,
                    ]}
                    selectable
                  >
                    {bytesToHex(detail.publicKey.key)}
                  </Text>
                  <Icon
                    name={copied === 'public' ? 'checkmark' : 'copy'}
                    size={16}
                    color={copied === 'public' ? 'positive_500' : 'neutral_500'}
                  />
                </Pressable>
              </View>

              {detail.onDevice ? (
                <View style={Atoms.gap_2xs}>
                  <View
                    style={[Atoms.flex_row, Atoms.gap_sm, Atoms.items_center]}
                  >
                    <Text variant="small" color="neutral_500">
                      Private key
                    </Text>
                    {copied === 'private' ? (
                      <Text variant="small" color="positive_500">
                        Copied
                      </Text>
                    ) : null}
                  </View>
                  {privateKeyHex ? (
                    <Pressable
                      onPress={() => void copy('private', privateKeyHex)}
                      style={[Atoms.flex_row, Atoms.gap_sm, Atoms.items_center]}
                    >
                      <Text
                        variant="secondary"
                        fontSize="sm"
                        style={[
                          { fontFamily: 'monospace', minWidth: 0 },
                          Atoms.flex_1,
                        ]}
                        selectable
                      >
                        {privateKeyHex}
                      </Text>
                      <Icon
                        name={copied === 'private' ? 'checkmark' : 'copy'}
                        size={16}
                        color={
                          copied === 'private' ? 'positive_500' : 'neutral_500'
                        }
                      />
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={revealPrivateKey}
                      style={[
                        Atoms.flex_row,
                        Atoms.gap_sm,
                        Atoms.items_center,
                        Atoms.py_sm,
                      ]}
                    >
                      <Icon name="eye" size={16} color="neutral_500" />
                      <Text variant="secondary" color="neutral_500">
                        {revealing ? 'Revealing...' : 'Tap to reveal'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              ) : null}
            </View>

            <View style={[Atoms.flex_row, Atoms.gap_md, Atoms.items_center]}>
              <Icon
                name={
                  !detail.onDevice
                    ? 'globe'
                    : detail.protected
                      ? 'lockClosed'
                      : 'lockOpen'
                }
                size={32}
                color={
                  detail.onDevice && !detail.protected
                    ? 'warning_400'
                    : 'neutral_500'
                }
              />
              <View style={[Atoms.flex_1, Atoms.gap_2xs, { minWidth: 0 }]}>
                <Text variant="secondary" fontWeight="bold" color="neutral_700">
                  {!detail.onDevice
                    ? 'Remote'
                    : detail.protected
                      ? 'Protected'
                      : 'Unprotected'}
                </Text>
                <Text variant="secondary" color="neutral_500">
                  {isWeb && detail.protected && detail.credentialLabel
                    ? `This key is in secure storage. Protected by passkey: ${detail.credentialLabel}`
                    : !detail.onDevice
                      ? 'This key is not available on this device.'
                      : detail.protected
                        ? 'This key is in secure storage.'
                        : 'This key is not in secure storage.'}
                </Text>
              </View>
            </View>

            <View style={[Atoms.flex_row, Atoms.gap_md, Atoms.items_center]}>
              <Icon
                name={detail.role === 'rotation' ? 'shieldCheckmark' : 'pencil'}
                size={32}
                color="neutral_1000"
              />
              <View style={[Atoms.flex_1, Atoms.gap_2xs, { minWidth: 0 }]}>
                <Text variant="secondary" fontWeight="bold" color="neutral_700">
                  {detail.role === 'rotation' ? 'Rotation key' : 'Signing key'}
                </Text>
                <Text variant="secondary" color="neutral_500">
                  {detail.role === 'rotation'
                    ? 'This key can make changes to your identity.'
                    : 'This key cannot make changes to your identity.'}
                </Text>
              </View>
            </View>

            {detail.role === 'signing' && detail.protected ? (
              <View
                style={[
                  Atoms.flex_row,
                  Atoms.gap_sm,
                  Atoms.p_md,
                  Atoms.rounded_md,
                  {
                    alignItems: 'flex-start',
                    backgroundColor: withHexOpacity(
                      theme.palette.negative_500,
                      '20',
                    ),
                  },
                ]}
              >
                <Icon name="warning" size={20} color="negative_500" />
                <Text
                  variant="secondary"
                  style={[Atoms.flex_1, { minWidth: 0 }]}
                >
                  This signing key is in secure storage, so you will be prompted
                  to unlock it every time it signs. Consider moving it out of
                  secure storage.
                </Text>
              </View>
            ) : null}

            {detail.protected ? (
              <Button
                variant="tertiary"
                title="Move out of secure storage"
                fullWidth
                disabled={busy}
                onPress={toggleProtection}
              />
            ) : !detail.protected &&
              protectedAvailable &&
              detail.role === 'rotation' ? (
              // Only show this option for rotation keys
              <Button
                variant="tertiary"
                title="Move into secure storage"
                fullWidth
                disabled={busy}
                onPress={toggleProtection}
              />
            ) : null}
          </>
        )}
      </Sheet.Content>
    </Sheet>
  );
}
