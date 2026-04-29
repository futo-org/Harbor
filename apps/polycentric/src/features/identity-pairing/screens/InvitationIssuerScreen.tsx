import { Button, Screen, ScreenHeader, Text } from '@/src/common/components';
import {
  useCurrentIdentity,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { SheetHeaderBlock, SheetMenu } from '@/src/common/lib/sheet';
import { Atoms, useTheme } from '@/src/common/theme';
import { useInvitationIssuer } from '@/src/features/identity-pairing/hooks/useInvitationIssuer';
import { publicKeyEmojiFingerprint } from '@/src/features/identity-pairing/publicKeyEmojiFingerprint';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

const PAIRING_BLOCK_WIDTH = 200;

function CountdownTimer({
  invitation,
  onExpire,
}: {
  invitation: { createdAt: Date; ttlSeconds: number } | null;
  onExpire?: () => void;
}) {
  const { theme } = useTheme();
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!invitation) {
      setRemaining(0);
      return;
    }

    const expiresAtMs =
      invitation.createdAt.getTime() + invitation.ttlSeconds * 1000;
    const updateRemaining = () => {
      const nextRemaining = Math.max(
        0,
        Math.floor((expiresAtMs - Date.now()) / 1000),
      );
      setRemaining(nextRemaining);

      if (nextRemaining === 0) {
        onExpire?.();
        return true;
      }

      return false;
    };

    if (updateRemaining()) {
      return;
    }

    const interval = setInterval(() => {
      if (updateRemaining()) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [invitation, onExpire]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <View style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_sm]}>
      <Ionicons
        name="time-outline"
        size={16}
        color={theme.palette.neutral_500}
      />
      <Text variant="small" color="neutral_500">
        Valid for{'  '}
        <Text
          variant="small"
          style={{
            fontFamily: 'monospace',
            color: theme.palette.primary_500,
          }}
        >
          {invitation ? timeStr : '--:--'}
        </Text>
      </Text>
    </View>
  );
}

export default function InvitationIssuerScreen() {
  const { theme } = useTheme();
  const { identityKey } = useCurrentIdentity();
  const {
    currentInvitation,
    pendingClaimers,
    createInvitation,
    invitationError,
    invitationLoading,
    clearInvitation,
    denyClaimer,
    approveClaimer,
  } = useInvitationIssuer(identityKey);
  const client = usePolycentric();
  const [justCopied, setJustCopied] = useState(false);
  const [approvingClaimers, setApprovingClaimers] = useState<Set<string>>(
    new Set(),
  );
  const [pairAsRotationKey, setPairAsRotationKey] = useState(true);
  const [showPendingApprovals, setShowPendingApprovals] = useState(false);

  const origin = client.servers[0] ?? '';

  const previousPendingCountRef = useRef(0);

  useEffect(() => {
    return () => {
      clearInvitation();
    };
  }, [clearInvitation]);

  useEffect(() => {
    if (
      identityKey &&
      !currentInvitation &&
      !invitationError &&
      !invitationLoading
    ) {
      void createInvitation();
    }
  }, [
    identityKey,
    currentInvitation,
    createInvitation,
    invitationError,
    invitationLoading,
  ]);

  useEffect(() => {
    const previous = previousPendingCountRef.current;
    const next = pendingClaimers.length;

    if (next > 0 && next > previous) {
      setShowPendingApprovals(true);
    }

    previousPendingCountRef.current = next;
  }, [pendingClaimers.length]);

  const handleExpire = () => {
    if (currentInvitation) {
      clearInvitation();
    }
    router.back();
  };

  const renderPendingApprovalsSheet = () => {
    const claimerStr = pendingClaimers[0];

    if (!claimerStr) {
      return null;
    }

    const isApproving = approvingClaimers.has(claimerStr);

    return (
      <SheetMenu
        detents={[0.6, 1]}
        dismissible
        scrollable
        onClose={() => setShowPendingApprovals(false)}
      >
        {(dismissSheet) => (
          <View style={Atoms.flex_1}>
            <SheetHeaderBlock
              title="Pending Approvals"
              onClose={() => void dismissSheet()}
            />
            <ScrollView
              style={Atoms.flex_1}
              contentContainerStyle={[
                Atoms.flex_grow_1,
                Atoms.p_lg,
                Atoms.justify_center,
                Atoms.gap_lg,
              ]}
            >
              <View style={[Atoms.items_center, Atoms.gap_md]}>
                <Text variant="title" style={{ fontSize: 64, lineHeight: 72 }}>
                  {publicKeyEmojiFingerprint(claimerStr).join(' ')}
                </Text>
                <Text
                  variant="small"
                  color="neutral_500"
                  style={{ fontFamily: 'monospace', textAlign: 'center' }}
                  selectable
                >
                  {claimerStr}
                </Text>
              </View>

              <View
                style={[
                  Atoms.flex_row,
                  Atoms.gap_sm,
                  Atoms.justify_center,
                  Atoms.items_center,
                ]}
              >
                {isApproving ? (
                  <View
                    style={[
                      Atoms.items_center,
                      Atoms.justify_center,
                      Atoms.py_md,
                    ]}
                  >
                    <ActivityIndicator size="small" />
                  </View>
                ) : (
                  <Button
                    title="Approve"
                    variant="primary"
                    size="md"
                    onPress={async () => {
                      if (!identityKey) {
                        return;
                      }

                      setApprovingClaimers(
                        (prev) => new Set([...prev, claimerStr]),
                      );

                      try {
                        await approveClaimer(claimerStr, pairAsRotationKey);
                      } catch {
                      } finally {
                        setApprovingClaimers((prev) => {
                          const next = new Set(prev);
                          next.delete(claimerStr);
                          return next;
                        });
                      }
                    }}
                  />
                )}
                <Button
                  title="Deny"
                  variant="secondary"
                  size="md"
                  onPress={() => {
                    denyClaimer(claimerStr);
                  }}
                />
              </View>

              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: pairAsRotationKey }}
                onPress={() => setPairAsRotationKey(!pairAsRotationKey)}
                style={[
                  Atoms.flex_row,
                  Atoms.items_start,
                  Atoms.gap_md,
                  Atoms.p_md,
                  Atoms.rounded_md,
                  {
                    backgroundColor: theme.palette.neutral_50,
                    borderWidth: 1,
                    borderColor: theme.palette.neutral_200,
                  },
                ]}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 7,
                    borderWidth: 1.5,
                    borderColor: pairAsRotationKey
                      ? theme.palette.primary_500
                      : theme.palette.neutral_300,
                    backgroundColor: pairAsRotationKey
                      ? theme.palette.primary_500
                      : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 1,
                  }}
                >
                  {pairAsRotationKey ? (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={theme.palette.neutral_0}
                    />
                  ) : null}
                </View>
                <View style={[Atoms.flex_1, Atoms.gap_xs]}>
                  <Text variant="small" fontWeight="semibold">
                    Add as rotation key
                  </Text>
                  <Text variant="small" color="neutral_500">
                    Gives this device management access.
                  </Text>
                </View>
              </Pressable>
            </ScrollView>
          </View>
        )}
      </SheetMenu>
    );
  };

  return (
    <>
      <Screen>
        <Screen.PrimaryColumn>
          <View
            style={[
              Atoms.px_lg,
              Atoms.flex_1,
              { backgroundColor: theme.atoms.bg.backgroundColor },
            ]}
          >
            <ScreenHeader title="Pair Identity" onBack={() => router.back()} />
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                Atoms.gap_lg,
                Atoms.pb_lg,
                Atoms.items_center,
                { paddingTop: 100 },
              ]}
            >
              {invitationError ? (
                <Text variant="body" color="negative_500">
                  {invitationError}
                </Text>
              ) : (
                <View style={Atoms.gap_md}>
                  <View
                    style={[
                      Atoms.items_center,
                      Atoms.justify_center,
                      Atoms.p_xl,
                      Atoms.rounded_lg,
                      {
                        backgroundColor: theme.palette.neutral_50,
                      },
                    ]}
                  >
                    {currentInvitation ? (
                      <QRCode
                        value={`${origin}\n${currentInvitation.code}`}
                        size={PAIRING_BLOCK_WIDTH}
                        color={theme.palette.neutral_950}
                        backgroundColor="transparent"
                      />
                    ) : (
                      <View
                        style={{
                          width: PAIRING_BLOCK_WIDTH,
                          height: PAIRING_BLOCK_WIDTH,
                        }}
                      />
                    )}
                  </View>

                  <Pressable
                    onPress={() => {
                      if (!currentInvitation) {
                        return;
                      }

                      void Clipboard.setStringAsync(
                        `${origin}\n${currentInvitation.code}`,
                      );
                      setJustCopied(true);
                      setTimeout(() => setJustCopied(false), 2000);
                    }}
                    disabled={invitationLoading || !currentInvitation}
                    style={({ hovered }) => [
                      Atoms.flex_row,
                      Atoms.items_center,
                      Atoms.justify_center,
                      Atoms.gap_sm,
                      Atoms.py_md,
                      Atoms.rounded_full,
                      {
                        backgroundColor: hovered
                          ? theme.palette.primary_100
                          : theme.palette.primary_50,
                      },
                    ]}
                  >
                    <Ionicons
                      name={justCopied ? 'checkmark' : 'copy-outline'}
                      size={16}
                      color={theme.palette.primary_500}
                    />
                    <Text
                      variant="small"
                      color="primary_500"
                      fontWeight="semibold"
                    >
                      {justCopied ? 'Copied' : 'Copy pairing code'}
                    </Text>
                  </Pressable>

                  <View style={Atoms.items_center}>
                    <CountdownTimer
                      invitation={currentInvitation}
                      onExpire={handleExpire}
                    />
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </Screen.PrimaryColumn>
      </Screen>

      {showPendingApprovals && pendingClaimers.length > 0
        ? renderPendingApprovalsSheet()
        : null}
    </>
  );
}
