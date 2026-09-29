import { EmojiImage } from '@/src/common/components/EmojiImage';
import { Button, Text } from '@/src/common/components/primitives';
import {
  publicKeyToString,
  usePolycentric,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { PairIdentityCamera } from '@/src/features/identity-pairing/components/PairIdentityCamera';
import { usePairIdentityClaimer } from '@/src/features/identity-pairing/hooks/usePairIdentityClaimer';
import { publicKeyEmojiFingerprint } from '@/src/features/identity-pairing/publicKeyEmojiFingerprint';
import { useOnboardingLinks } from '@/src/features/onboarding/hooks/useOnboardingLinks';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, type TextStyle, View } from 'react-native';
import type { v2 } from '@polycentric/react-native';

export default function PairIdentityClaimerScreen() {
  const { theme } = useTheme();
  const { refreshCurrentIdentity } = usePolycentricContext();
  const { to } = useOnboardingLinks();

  // Error state is managed by `usePairIdentityClaimer()`, so we use `null`
  // to mean that the pairing code was invalid and couldn't be parsed and
  // `undefined` to mean that we just don't have one.
  const [pairingInfo, setPairingInfo] = useState<
    v2.PairingInfo | null | undefined
  >(undefined);

  const { error, approved, claimInProgress } =
    usePairIdentityClaimer(pairingInfo);

  useEffect(() => {
    if (!approved) return;
    void (async () => {
      await refreshCurrentIdentity();
      // Carry the origin route through to the success screen.
      router.replace(to('/login/pair/success'));
    })();
  }, [approved, refreshCurrentIdentity, to]);

  const renderBody = () => {
    if (pairingInfo === undefined) {
      return (
        <>
          <View style={Atoms.gap_xs}>
            <Text variant="subtitle">Pair Identity</Text>
          </View>
          <PairIdentityCamera
            onCodeScanned={(info) => {
              setPairingInfo(info);
            }}
          />
        </>
      );
    }

    if (pairingInfo !== undefined && error && !claimInProgress) {
      return (
        <>
          <Text variant="title">Error</Text>
          <Text variant="body" color="negative_500">
            {error}
          </Text>
          <Button
            title="Go Back"
            variant="secondary"
            fullWidth
            onPress={() => {
              setPairingInfo(undefined);
            }}
          />
        </>
      );
    }

    return (
      <View
        style={[
          Atoms.flex_1,
          Atoms.items_center,
          Atoms.justify_center,
          Atoms.gap_xl,
        ]}
      >
        {approved ? (
          <>
            <Text variant="title" style={{ fontSize: 64, lineHeight: 72 }}>
              ✓
            </Text>
            <View style={[Atoms.items_center, Atoms.gap_xs]}>
              <Text variant="title">Approved!</Text>
              <Text
                variant="body"
                color="neutral_500"
                style={{ textAlign: 'center' }}
              >
                Completing setup...
              </Text>
            </View>
          </>
        ) : (
          <>
            <PairingEmojiCard />
            <Text variant="secondary" style={{ textAlign: 'center' }}>
              Check your other device
            </Text>
          </>
        )}
      </View>
    );
  };

  return (
    <View
      style={[
        Atoms.flex_1,
        { backgroundColor: theme.atoms.bg.backgroundColor },
        ...(!pairingInfo || (pairingInfo && error && !claimInProgress)
          ? [Atoms.flex_col, Atoms.gap_lg]
          : []),
      ]}
    >
      {renderBody()}
    </View>
  );
}

function PairingEmojiCard(): ReactNode {
  const { theme } = useTheme();
  const client = usePolycentric();

  const pubKeyStr = client.currentKeyPair
    ? publicKeyToString(client.currentKeyPair.publicKey)
    : '';

  const pubKeyEmojis = pubKeyStr ? publicKeyEmojiFingerprint(pubKeyStr) : [];

  return (
    <View
      style={[
        Atoms.w_full,
        Atoms.items_center,
        Atoms.gap_md,
        Atoms.p_lg,
        Atoms.rounded_lg,
        {
          maxWidth: 350,
          backgroundColor: theme.palette.neutral_50,
        },
      ]}
    >
      <Text variant="subtitle" style={{ textAlign: 'center' }}>
        Your matching code
      </Text>

      <View
        style={[
          Atoms.w_full,
          Atoms.flex_row,
          Atoms.items_center,
          Atoms.justify_center,
          Atoms.gap_lg,
          Atoms.rounded_lg,
          Atoms.overflow_hidden,
          Atoms.py_lg,
          Atoms.px_lg,
          { backgroundColor: theme.palette.white },
        ]}
      >
        {pubKeyEmojis.map((emoji, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: short emoji sequence that doesn't reorder
          <EmojiImage key={i} sequence={emoji} size={60} />
        ))}
      </View>

      <Text
        variant="small"
        color="neutral_500"
        selectable
        style={[
          { fontFamily: 'monospace', textAlign: 'center' },
          // The pubkey string is a long string with no whitespace
          isWeb && ({ wordBreak: 'break-all' } as unknown as TextStyle),
        ]}
      >
        {pubKeyStr}
      </Text>

      <View style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_sm]}>
        <ActivityIndicator size="small" />
        <Text variant="small" color="neutral_500" style={Atoms.flex_shrink_1}>
          Waiting for approval from other device
        </Text>
      </View>
    </View>
  );
}
