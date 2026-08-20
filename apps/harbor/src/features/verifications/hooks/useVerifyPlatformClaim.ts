import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import { useState } from 'react';
import { PLATFORM_SCHEMA_NAME, type Platform } from '../utils/platforms';
import { formToSchema } from '../utils/schemas';
import { type VerifierClaimField, verifierApi } from '../utils/verifier-api';
import { deleteClaim } from './useClaimActions';
import useCreateClaim, { type ClaimRef } from './useCreateClaim';
import { publishVerifierBotTargets } from './useRequestVerification';

// The bot addresses account fields by ordinal; these names double as labels.
function fieldKey(index: number): string {
  return index === 0
    ? 'account'
    : index === 1
      ? 'account_id'
      : `field_${index}`;
}

function fieldLabel(index: number): string {
  return index === 0
    ? 'Account'
    : index === 1
      ? 'Account ID'
      : `Field ${index + 1}`;
}

// The bot's URL regexes expect a scheme; the input accepts bare domains.
function normalizeProfileUrl(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Build the 'Platform' claim schema and values: the platform slug, the
 * account fields, and the profile URL when there is one.
 */
export function platformClaimParts(
  platform: Platform,
  claimFields: VerifierClaimField[],
  profileUrl?: string,
) {
  const ordered = [...claimFields].sort((a, b) => a.key - b.key);
  const fields = [
    { key: 'platform', label: 'Platform', value: platform.slug },
    ...ordered.map((field, i) => ({
      key: fieldKey(i),
      label: fieldLabel(i),
      value: field.value,
    })),
    ...(profileUrl
      ? [{ key: 'url', label: 'Profile URL', value: profileUrl }]
      : []),
  ];
  const schema = formToSchema({
    name: PLATFORM_SCHEMA_NAME,
    fields: fields.map(({ key, label }) => ({ key, label, required: true })),
  });
  const values = Object.fromEntries(
    fields.map(({ key, value }) => [key, value]),
  );
  return { schema, values };
}

/**
 * The loop-back flow: resolve the profile URL to claim fields, check the
 * profile has the token, publish the claim, then have the servers verify it.
 */
export default function useVerifyPlatformClaim() {
  const client = usePolycentric();
  const createClaim = useCreateClaim();
  const [isPending, setPending] = useState(false);

  return {
    isPending,
    submit: async ({
      platform,
      profileUrl,
    }: {
      platform: Platform;
      profileUrl: string;
    }): Promise<ClaimRef> => {
      if (isPending) {
        throw 'Already pending';
      }
      setPending(true);
      try {
        const url = normalizeProfileUrl(profileUrl);
        const claimFields = await verifierApi.getClaimFieldsByUrl(
          platform.slug,
          url,
        );

        // Check the profile before publishing anything. The token is the
        // author's identity key (see the bot's claims.ts).
        const token = client.activeIdentityKey;
        if (!token) throw new Error('No active identity');
        await verifierApi.checkTextClaim(platform.slug, claimFields, token);

        const { schema, values } = platformClaimParts(
          platform,
          claimFields,
          url,
        );
        const ref = await createClaim.submit({ schema, values });
        if (!ref) {
          throw new Error('Failed to create the claim');
        }

        // Verify needs the claim published; roll it back on failure so
        // retries don't pile up claims.
        try {
          await publishVerifierBotTargets(client, ref.id);
          await verifierApi.requestTextVerify(platform.slug, ref.id);
        } catch (e) {
          await deleteClaim(client, ref.id).catch(() => {});
          invalidateQuery(client, ['claims-list', ref.identity]);
          throw e;
        }

        // The bot's verify is now on the servers; refresh the claim's status.
        invalidateQuery(client, ['verification-verifies', ref.id]);
        return ref;
      } finally {
        setPending(false);
      }
    },
  };
}
