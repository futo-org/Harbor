import { Button, Screen, ScreenHeader, Text } from '@/src/common/components';
import {
  publicKeyToString,
  usePolycentric,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { PairIdentityCamera } from '@/src/features/identity-pairing/components/PairIdentityCamera';
import { useInvitationClaimer } from '@/src/features/identity-pairing/hooks/useInvitationClaimer';
import { publicKeyEmojiFingerprint } from '@/src/features/identity-pairing/publicKeyEmojiFingerprint';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

const parseInput = (text: string) => {
  const lines = text.trim().split('\n');
  if (lines.length === 2) {
    return { server: lines[0], code: lines[1] };
  }
  return { server: null, code: text.trim() };
};

export default function InvitationClaimerScreen() {
  const { theme } = useTheme();
  const { inviteCode: paramInviteCode } = useLocalSearchParams<{
    inviteCode?: string;
  }>();
  const client = usePolycentric();
  const { refreshCurrentIdentity } = usePolycentricContext();
  const [inviteCode, setInviteCode] = useState<string | undefined>(
    paramInviteCode,
  );
  const [inviteServer, setInviteServer] = useState<string | undefined>(
    undefined,
  );

  const { error, approved, claimInProgress } = useInvitationClaimer({
    inviteCode,
    inviteServer,
  });

  const pubKeyStr = client.currentKeyPair
    ? publicKeyToString(client.currentKeyPair.publicKey)
    : '';
  const pubKeyEmoji = pubKeyStr
    ? publicKeyEmojiFingerprint(pubKeyStr).join(' ')
    : '';

  useEffect(() => {
    if (!approved) return;
    void (async () => {
      await refreshCurrentIdentity();
      router.replace('/(onboarding)/login/success');
    })();
  }, [approved, refreshCurrentIdentity]);

  const renderBody = () => {
    if (!inviteCode) {
      return (
        <>
          <View style={Atoms.gap_xs}>
            <Text variant="subtitle">Pair Identity</Text>
          </View>
          <PairIdentityCamera
            onCodeScanned={(code, server) => {
              setInviteCode(code);
              setInviteServer(server ?? undefined);
            }}
            parseInput={parseInput}
          />
        </>
      );
    }

    if (inviteCode && error && !claimInProgress) {
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
              setInviteCode(undefined);
              setInviteServer(undefined);
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
            <Text
              variant="title"
              style={{
                fontSize: 84,
                lineHeight: 92,
                textAlign: 'center',
              }}
            >
              {pubKeyEmoji}
            </Text>

            <View style={[Atoms.items_center, Atoms.gap_sm]}>
              <Text
                variant="small"
                color="neutral_500"
                selectable
                style={{ fontFamily: 'monospace', textAlign: 'center' }}
              >
                {pubKeyStr}
              </Text>
            </View>

            <View
              style={[
                Atoms.flex_row,
                Atoms.items_center,
                Atoms.gap_sm,
                Atoms.px_md,
                Atoms.py_sm,
                Atoms.rounded_full,
                {
                  backgroundColor: theme.palette.neutral_50,
                },
              ]}
            >
              <ActivityIndicator size="small" />
              <Text variant="small" color="neutral_500">
                Waiting for approval
              </Text>
            </View>
          </>
        )}
      </View>
    );
  };

  return (
    <Screen>
      <Screen.PrimaryColumn>
        <View
          style={[
            Atoms.flex_1,
            Atoms.py_lg,
            Atoms.px_lg,
            { backgroundColor: theme.atoms.bg.backgroundColor },
            ...(!inviteCode || (inviteCode && error && !claimInProgress)
              ? [Atoms.flex_col, Atoms.gap_lg]
              : []),
          ]}
        >
          <ScreenHeader onBack={() => router.back()} />
          {renderBody()}
        </View>
      </Screen.PrimaryColumn>
    </Screen>
  );
}
