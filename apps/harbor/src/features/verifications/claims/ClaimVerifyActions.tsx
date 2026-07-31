import { Button } from '@/src/common/components';
import { useToast } from '@/src/common/components/toast';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { useState } from 'react';
import type { DecodedClaim } from '../hooks/useClaimById';
import useRequestPlatformVerification from '../hooks/useRequestPlatformVerification';
import useVerifyClaim from '../hooks/useVerifyClaim';
import { RequestVerificationSheet } from '../RequestVerificationSheet';
import type { ClaimVerifier } from '../utils/claim-status';
import { getPlatformFromClaim } from '../utils/platforms';

/**
 * The claim page's verify buttons. Authors get "Verify with <Platform>" for
 * platform claims and the request-verification picker otherwise; a viewer
 * who was asked to verify gets a verify button.
 */
export function ClaimVerifyActions({
  claim,
  verifiers,
  requestOnOpen = false,
}: {
  claim: DecodedClaim;
  verifiers: ClaimVerifier[];
  // Open the request-verification sheet immediately (create-flow handoff).
  requestOnOpen?: boolean;
}) {
  const toast = useToast();
  const { identityKey } = useCurrentIdentity();
  const [sheetOpen, setSheetOpen] = useState(requestOnOpen);

  const { verify, isPending: isVerifyPending } = useVerifyClaim();
  const platformVerification = useRequestPlatformVerification();

  // Only the claim author can request verifications; a viewer asked to
  // verify gets a verify button instead, disabled once they have verified.
  const isAuthor = claim.identity === identityKey;
  const verifyRequest = isAuthor
    ? undefined
    : verifiers.find((v) => v.identity === identityKey);

  // Platform claims can (re-)request verification from the verifier servers.
  const platform = getPlatformFromClaim(claim.schemaName, claim.fields);

  const onPlatformVerify = () => {
    if (!platform) return;
    void platformVerification
      .submit({ platform, claimId: claim.id })
      .then(() => toast.success('Claim verified'))
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : String(e)),
      );
  };

  if (isAuthor && platform) {
    return (
      <Button
        title={
          platformVerification.isPending
            ? 'Verifying…'
            : `Verify with ${platform.name}`
        }
        variant="primary"
        disabled={platformVerification.isPending}
        onPress={onPlatformVerify}
        style={[Atoms.w_full]}
      />
    );
  }

  // Platform claims verify through their verifier server; the identity
  // picker only applies to the other claim types.
  if (isAuthor) {
    return (
      <>
        <Button
          title="Request verification"
          variant="primary"
          onPress={() => setSheetOpen(true)}
          style={[Atoms.w_full]}
        />

        <RequestVerificationSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          claimId={claim.id}
        />
      </>
    );
  }

  if (verifyRequest) {
    return (
      <Button
        title={verifyRequest.verified ? 'Verified' : 'Verify this claim'}
        variant="primary"
        disabled={verifyRequest.verified || isVerifyPending}
        onPress={() => verify({ claimId: claim.id })}
        style={[Atoms.w_full]}
      />
    );
  }

  return null;
}
