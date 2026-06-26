import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { getKeyFingerprint } from '@/src/common/lib/polycentric-hooks/helpers';
import { COLLECTION, SyncStrategy, v2 } from '@polycentric/react-native';
import { useState } from 'react';
import { encodeFieldValue, serializeSchema } from '../utils/schemas';

// Identifies a created claim event for routing to its view.
export interface ClaimRef {
  identity: string;
  keyFingerprint: string;
  sequence: string;
}

export default function useCreateClaim() {
  const client = usePolycentric();

  const [isPending, setPending] = useState<boolean>(false);

  return {
    isPending,
    submit: async ({
      schema,
      values,
      targetIdentities = [],
    }: {
      schema: v2.VerificationSchema;
      values: Record<string, string>;
      targetIdentities?: string[];
    }): Promise<ClaimRef | undefined> => {
      if (isPending) {
        throw 'Already pending';
      }
      setPending(true);

      try {
        const fields: { [key: string]: Uint8Array } = {};
        for (const field of schema.fields) {
          const raw = values[field.key]?.trim() ?? '';
          // Omit empty fields; required ones are validated by the caller.
          if (raw.length === 0) continue;
          fields[field.key] = encodeFieldValue(field.kind, raw);
        }

        const content = v2.Content.create({
          contentBody: {
            oneofKind: 'verificationClaim',
            verificationClaim: {
              schema: serializeSchema(schema),
              fields,
              targetIdentities,
            },
          },
        });

        // Persist the content first: the event references it by digest, and
        // `sync()` looks the content up from the local store to attach it.
        await client.contentManager.save(content);

        const event = await client.buildEvent(
          content,
          COLLECTION.VERIFICATIONS,
        );
        const signedEvent = await client.signEvent(event);

        // Save the event locally and mirror it (with content) into the core.
        await client.commitEvent(signedEvent, content);

        // Delivery to servers is best-effort — the claim is already saved
        // locally and will be pushed on the next sync if this fails.
        try {
          await client.sync(SyncStrategy.PARTIAL_PUSH);
        } catch (e) {
          console.warn('Failed to push claim to servers:', e);
        }

        const key = event.key;
        if (!key?.signedBy) return undefined;
        return {
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
