import {
  useCurrentIdentity,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import {
  bundleEvent,
  eventKeyId,
  getKeyFingerprint,
} from '@/src/common/lib/polycentric-hooks/helpers';
import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import { COLLECTION, SyncStrategy, v2 } from '@polycentric/react-native';
import { useState } from 'react';
import { useClaimCreateOptions } from '../claims/create/ClaimCreateContext';
import { encodeFieldValue, serializeSchema } from '../utils/schemas';
import { publishVerificationTarget } from './useRequestVerification';

// Identifies a created claim event for routing to its view.
export interface ClaimRef {
  // Hex-encoded event key (`DecodedClaim.id`).
  id: string;
  identity: string;
  keyFingerprint: string;
  sequence: string;
}

export default function useCreateClaim() {
  const client = usePolycentric();
  const { identityKey } = useCurrentIdentity();
  // When set, the fresh claim is targeted at this identity for verification.
  const { requestFrom } = useClaimCreateOptions();

  const [isPending, setPending] = useState<boolean>(false);

  return {
    isPending,
    submit: async ({
      schema,
      values,
    }: {
      schema: v2.VerificationSchema;
      values: Record<string, string>;
    }): Promise<ClaimRef | undefined> => {
      if (isPending) {
        throw 'Already pending';
      }
      setPending(true);

      try {
        const fields = new Map<string, ArrayBuffer>();
        for (const field of schema.fields) {
          const raw = values[field.key]?.trim() ?? '';
          // Omit empty fields; required ones are validated by the caller.
          if (raw.length === 0) continue;
          fields.set(field.key, encodeFieldValue(field.kind, raw));
        }

        const content = v2.Content.create({
          contentBody: new v2.ContentBody.VerificationClaim({
            verificationClaim: v2.VerificationClaim.create({
              schema: serializeSchema(schema),
              fields,
            }),
          }),
        });

        // Sign and store the claim locally.
        const bundle = await client.publish(content, COLLECTION.VERIFICATIONS);
        const key = bundleEvent(bundle)?.key;

        try {
          await client.sync(SyncStrategy.PartialPush);
        } catch (err) {
          console.error(err);
        }

        // The same sync below delivers both events.
        if (requestFrom && key) {
          await publishVerificationTarget(client, key, [requestFrom]);
        }

        // Delivery to servers is best-effort — the claim is already saved
        // locally and will be pushed on the next sync if this fails.
        try {
          await client.sync(SyncStrategy.PartialPush);
        } catch (e) {
          console.warn('Failed to push claim to servers:', e);
        }

        // Refresh the creator's claim list so the new claim shows up.
        if (identityKey) {
          invalidateQuery(client, ['claims-list', identityKey]);
        }

        if (!key?.signedBy) return undefined;
        return {
          id: eventKeyId(key),
          identity: key.identity,
          keyFingerprint: getKeyFingerprint(key.signedBy) ?? '',
          sequence: key.sequence.toString(),
        };
      } finally {
        setPending(false);
      }
    },
  };
}
