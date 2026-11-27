import { Routes } from '@/src/common/constants';
import { decodeBundle } from '@/src/common/lib/polycentric-hooks/helpers';
import { decodeClaimBundle } from '@/src/features/verifications/hooks/useClaimById';
import { verificationHead } from './index';
import { v2 } from '@polycentric/react-native-sdk';
import { hasModerationLabel } from '@/src/common/lib/head/content';
import { unaryCall } from '@/src/common/lib/head/unary-call.server';
import type { Head } from '@/src/common/lib/head';
import { createAuthoredMetadata } from '@/src/features/profile/head/create-authored-metadata.server';
import type { Author } from '@/src/features/profile/head';

/** Null if the claim is gone or has a moderation label */
async function loadVerificationHead(
  author: Author,
  path: string,
  keyFingerprint: string,
  sequence: bigint,
  signal: AbortSignal,
): Promise<Head | null> {
  const response = await unaryCall(
    'VerificationsService/GetVerificationClaim',
    v2.GetVerificationClaimRequest,
    v2.GetVerificationClaimResponse,
    { identity: author.identity, sequence },
    signal,
  );
  if (hasModerationLabel(response.eventHints)) return null;

  const bundle = response.candidates.find((candidate) => {
    const claim = decodeClaimBundle(candidate);
    return (
      claim?.keyFingerprint === keyFingerprint && claim.sequence === sequence
    );
  });
  const claim = bundle && decodeClaimBundle(bundle);
  const claimEventKey =
    bundle && decodeBundle(bundle, 'verificationClaim')?.event.key;
  if (!claim || !claimEventKey) return null;

  const verifies = await unaryCall(
    'VerificationsService/ListVerificationVerifies',
    v2.ListVerificationVerifiesRequest,
    v2.ListVerificationVerifiesResponse,
    { claimEventKey },
    signal,
  );
  const verifierCount = new Set(
    verifies.eventBundles.map(
      (verify) =>
        decodeBundle(verify, 'verificationVerify')?.event.key?.identity,
    ),
  ).size;

  return verificationHead({ author, path, claim, verifierCount });
}

export const verificationMetadata = createAuthoredMetadata(
  'Claim',
  Routes.tabs.verification,
  loadVerificationHead,
);
