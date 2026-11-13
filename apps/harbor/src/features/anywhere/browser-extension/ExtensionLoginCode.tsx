import { Button, Text } from '@/src/common/components';
import {
  publicKeyToString,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, ZIndex } from '@/src/common/theme';
import { EmojiFingerprint } from '@/src/features/identity-pairing/components/EmojiFingerprint';
import { usePairIdentityClaimer } from '@/src/features/identity-pairing/hooks/usePairIdentityClaimer';
import type { v2 } from '@polycentric/react-native';
import { useEffect } from 'react';
import { View } from 'react-native';

/** Joins the Harbor tab's pairing session and shows its key's emoji. */
export function ExtensionLoginCode({
  session,
  onCancel,
}: {
  session: v2.PairingInfo;
  onCancel: () => void;
}) {
  const { theme } = useTheme();
  const { refreshCurrentIdentity } = usePolycentricContext();
  const { stage, issuerIdentity, myPublicKey, approved, join } =
    usePairIdentityClaimer(session);

  // Joining grants nothing: the tab's user approves the key by its emoji.
  useEffect(() => {
    if (stage === 'confirming' && issuerIdentity) join();
  }, [stage, issuerIdentity, join]);

  useEffect(() => {
    if (stage === 'error') onCancel();
  }, [stage, onCancel]);

  useEffect(() => {
    if (approved) void refreshCurrentIdentity();
  }, [approved, refreshCurrentIdentity]);

  return (
    <View
      style={[
        Atoms.items_center,
        Atoms.gap_md,
        Atoms.p_lg,
        Atoms.fixed,
        theme.atoms.bg,
        {
          bottom: 0,
          left: 0,
          right: 0,
          borderTopWidth: 1,
          borderTopColor: theme.palette.neutral_25,
          zIndex: ZIndex.raised,
        },
      ]}
    >
      <Text fontWeight="bold">Your matching code</Text>
      <EmojiFingerprint
        publicKey={myPublicKey ? publicKeyToString(myPublicKey) : undefined}
        bare
      />
      <Text variant="small" color="neutral_500" style={Atoms.text_center}>
        Approve in the Harbor tab if it shows the same emoji.
      </Text>
      <Button title="Cancel" variant="tertiary" onPress={onCancel} />
    </View>
  );
}
