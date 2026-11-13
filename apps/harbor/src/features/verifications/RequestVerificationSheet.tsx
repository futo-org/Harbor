import { Text } from '@/src/common/components';
import { Sheet } from '@/src/common/components/sheet';
import { useToast } from '@/src/common/components/toast';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { ProfileSearchInput } from '@/src/features/profile/search';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import useRequestVerification from './hooks/useRequestVerification';

export function RequestVerificationSheet({
  open,
  onClose,
  claimId,
}: {
  open: boolean;
  onClose: () => void;
  // Hex-encoded claim event key (`DecodedClaim.id`).
  claimId: string;
}) {
  const toast = useToast();
  const { identityKey } = useCurrentIdentity();
  const request = useRequestVerification();

  // The row the request is in flight for, so only it shows a spinner.
  const [pendingIdentity, setPendingIdentity] = useState<string | null>(null);

  const onSelect = async (identity: string) => {
    if (request.isPending) return;
    setPendingIdentity(identity);
    try {
      await request.submit({ claimId, identity });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      return;
    } finally {
      setPendingIdentity(null);
    }
    toast.success('Verification requested');
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      detents={[0.75]}
      header={<Sheet.Header title="Request verification" onClose={onClose} />}
    >
      <Sheet.Content scrollable={false} style={{ padding: 0 }}>
        {/* RN's ScrollView, so TrueSheet finds it to pin and inset; taps on
            suggestions must land while the keyboard is open. */}
        <ScrollView
          style={Atoms.flex_1}
          contentContainerStyle={[Atoms.pt_lg, Atoms.gap_md, Atoms.pb_lg]}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="body" color="secondary" style={Atoms.px_lg}>
            Ask someone to verify this claim.
          </Text>

          <ProfileSearchInput
            onSelect={(identity) => void onSelect(identity)}
            exclude={identityKey ? [identityKey] : undefined}
            pendingIdentity={pendingIdentity}
            disabled={request.isPending}
          />
        </ScrollView>
      </Sheet.Content>
    </Sheet>
  );
}
