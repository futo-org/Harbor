import { APP_NAME, Routes } from '@/src/common/constants';
import { decodeBundle } from '@/src/common/lib/polycentric-hooks/helpers';
import { truncateText } from '@/src/common/util/truncateText';
import { decodeClaimBundle } from '@/src/features/verifications/hooks/useClaimById';
import { resolveClaimTitle } from '@/src/features/verifications/utils/render';
import { v2 } from '@polycentric/react-native-sdk';
import {
  hasModerationLabel,
  toPageImage,
} from '@/src/common/lib/page-metadata/content';
import { unaryCall } from '@/src/common/lib/page-metadata/unary-call';
import {
  type Page,
  plural,
  toDescription,
} from '@/src/common/lib/page-metadata/page';
import { createAuthoredMetadata } from '@/src/features/profile/lib/create-authored-metadata';
import type { Author } from '@/src/features/profile/lib/load-author';

/** Null if the claim is gone or has a moderation label */
async function verificationPage(
  author: Author,
  path: string,
  keyFingerprint: string,
  sequence: bigint,
  signal: AbortSignal,
): Promise<Page | null> {
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

  const { title, bodyFields } = resolveClaimTitle(
    claim.schemaName,
    claim.fields,
  );
  const verified =
    verifierCount > 0
      ? `Verified by ${plural(verifierCount, 'identity', 'identities')}.`
      : 'Not verified yet.';
  const details = bodyFields
    .filter((field) => field.value.trim())
    .map((field) => `${field.label || field.key}: ${field.value}`)
    .join(' · ');
  const image = toPageImage(claim.images.at(0));

  return {
    title: `${truncateText(title, 80)} - claimed by ${author.name}`,
    description: toDescription(
      `${author.name} claims "${title}" on ${APP_NAME}. ${verified} ${details}`,
    ),
    path,
    type: 'article',
    image: image ?? author.avatar,
    imageAlt: image ? 'Image attached to the claim' : `${author.name}'s avatar`,
    largeImage: !!image,
    publishedTime: new Date(Number(claim.createdAt)).toISOString(),
    authorPath: author.path,
  };
}

export const verificationMetadata = createAuthoredMetadata(
  'Claim',
  Routes.tabs.verification,
  verificationPage,
);
