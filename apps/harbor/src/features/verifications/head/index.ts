import { APP_NAME } from '@/src/common/constants';
import { type HeadImage, toHeadImage } from '@/src/common/lib/head/content';
import { type Head, plural, toDescription } from '@/src/common/lib/head';
import { truncateText } from '@/src/common/util/truncateText';
import type { Author } from '@/src/features/profile/head';
import type { DecodedClaim } from '@/src/features/verifications/hooks/useClaimById';
import { resolveClaimTitle } from '@/src/features/verifications/utils/render';

export type VerificationHeadInput = {
  author: Author;
  /** Canonical path of the claim */
  path: string;
  claim: DecodedClaim;
  /** Identities that have verified the claim */
  verifierCount: number;
};

export function verificationHead({
  author,
  path,
  claim,
  verifierCount,
}: VerificationHeadInput): Head {
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
  const image: HeadImage | null = toHeadImage(claim.images.at(0));

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
