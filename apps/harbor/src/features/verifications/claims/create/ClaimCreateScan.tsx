import { useToast } from '@/src/common/components/toast';
import { Atoms } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { PairIdentityCamera } from '@/src/features/identity-pairing/components/PairIdentityCamera';
import type { ScanCopy } from '@/src/features/identity-pairing/components/PairIdentityCamera.types';
import { useState } from 'react';
import { View } from 'react-native';
import { type ClaimLink, parseClaimLinkUrl } from '../link/lib/claim-link';

const SCAN_HEIGHT = 420;

const COPY: ScanCopy = {
  hint: 'Scan a claim QR code, like the one shown at an event.',
  label: 'CLAIM LINK',
  placeholder: 'Paste claim link',
};

type ClaimCreateScanProps = {
  onScanned: (link: ClaimLink) => void;
};

/** Scans a claim QR code, or takes the link pasted in */
export function ClaimCreateScan({ onScanned }: ClaimCreateScanProps) {
  const toast = useToast();
  // The camera stops after one code, so a bad one remounts it
  const [attempt, setAttempt] = useState(0);

  const onCode = (scanned: string) => {
    const link = parseClaimLinkUrl(scanned);

    if (link) {
      onScanned(link);
      return;
    }

    toast.error("That isn't a claim code.");
    setAttempt((count) => count + 1);
  };

  return (
    // The native camera fills its parent, so it needs a height
    <View style={[Atoms.gap_md, !isWeb && { height: SCAN_HEIGHT }]}>
      <PairIdentityCamera key={attempt} onCodeScanned={onCode} copy={COPY} />
    </View>
  );
}
