import { useLocalSearchParams } from 'expo-router';
import { ContentImageViewerScreen } from '@/src/common/components/ImageViewer';
import { Routes } from '@/src/common/constants/routes';
import { openWithReturn } from '@/src/common/lib/navigation/openWithReturn';
import { type DecodedClaim, useClaimById } from '../hooks/useClaimById';

/**
 * Full-screen viewer for one claim's images, mounted by the
 * `/[identityId]/verifications/[keyFingerprint]/[sequence]/image/[index]`
 * route as a transparentModal over the claim view.
 */
export default function ClaimImageViewerScreen() {
  const {
    identityId,
    keyFingerprint,
    sequence = '',
  } = useLocalSearchParams<{
    identityId: string;
    keyFingerprint: string;
    sequence: string;
  }>();

  const { claim, isLoading } = useClaimById(
    identityId,
    keyFingerprint,
    sequence ? BigInt(sequence) : undefined,
  );

  return (
    <ContentImageViewerScreen
      images={claim?.images}
      isLoading={isLoading}
      fallbackHref={Routes.tabs.verification(
        identityId,
        keyFingerprint,
        sequence,
      )}
    />
  );
}

/** Open the viewer for a claim's images; `index` is the 0-based tap index. */
export function openClaimImage(claim: DecodedClaim, index: number) {
  // URLs count images from 1.
  openWithReturn(
    Routes.tabs.claimImage(
      claim.identity,
      claim.keyFingerprint,
      claim.sequence.toString(),
      index + 1,
    ),
  );
}
