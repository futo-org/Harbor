/**
 * Record fixtures for verification tests. Build them against the Jest
 * stand-in (`jest.mock('@polycentric/react-native', () =>
 * jest.requireActual('@/test/polycentric'))`).
 */
import { v2 } from '@polycentric/react-native';

/** An event key in the verifications collection. */
export function verificationKey(
  identity: string,
  sequence: bigint | number,
  signer: number[] = [0xaa],
): v2.EventKey {
  return v2.EventKey.create({
    identity,
    collection: 8,
    sequence: BigInt(sequence),
    signedBy: v2.PublicKey.create({
      keyType: v2.KeyType.Ed25519,
      key: new Uint8Array(signer).buffer,
    }),
  });
}

/** A decoded bundle of `content` under `key`. */
export function eventBundle(
  key: v2.EventKey,
  content: v2.Content,
): v2.EventBundle {
  return v2.EventBundle.create({
    signedEvent: v2.SignedEvent.create({
      event: v2.Event.create({ key, createdAt: 1000n }),
      signature: new ArrayBuffer(1),
    }),
    serializedContent: v2.SerializedContent.create({ content }),
  });
}

export function verificationTargetContent(
  targetIdentities: string[],
  claimEventKey?: v2.EventKey,
): v2.Content {
  return v2.Content.create({
    contentBody: new v2.ContentBody.VerificationTarget({
      verificationTarget: v2.VerificationTarget.create({
        claimEventKey,
        targetIdentities,
      }),
    }),
  });
}

export function verificationVerifyContent(
  claimEventKey: v2.EventKey,
): v2.Content {
  return v2.Content.create({
    contentBody: new v2.ContentBody.VerificationVerify({
      verificationVerify: v2.VerificationVerify.create({ claimEventKey }),
    }),
  });
}

export function verificationClaimContent(
  schema: v2.VerificationSchema,
  fields: Record<string, string> = {},
): v2.Content {
  return v2.Content.create({
    contentBody: new v2.ContentBody.VerificationClaim({
      verificationClaim: v2.VerificationClaim.create({
        schema: { schema },
        fields: new Map(
          Object.entries(fields).map(([k, v]) => [
            k,
            new TextEncoder().encode(v).buffer as ArrayBuffer,
          ]),
        ),
      }),
    }),
  });
}

/** A fake `client.publish` result: the content under a key at `sequence`. */
export function publishedBundle(
  content: v2.Content,
  collection: number,
  identity = 'me',
  sequence = 9n,
): v2.EventBundle {
  return eventBundle(
    v2.EventKey.create({
      ...verificationKey(identity, sequence),
      collection,
    }),
    content,
  );
}
