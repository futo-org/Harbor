// `@polycentric/react-native`'s barrel pulls in native uniffi init at import
// time, which can't run under jest. The pick only needs the `v2` protos.
jest.mock('@polycentric/react-native-sdk', () => ({
  v2: jest.requireActual('../../../../../../packages/js/js-sdk/src/proto/v2'),
}));

// Evaluates query state from the native barrel at import time, which the pick
// never touches.
jest.mock('@/src/common/query/hooks/useQuery', () => ({}));

// ESM-only package jest can't parse; the pick never hashes schemas.
jest.mock('@noble/hashes/sha2.js', () => ({}));

import { v2 } from '@polycentric/react-native-sdk';
import { pickClaim } from './useClaimById';

const IDENTITY = 'claimowner';

describe('pickClaim', () => {
  it('returns the claim matching the signer and sequence', () => {
    const response = v2.GetVerificationClaimResponse.create({
      candidates: [claimBundle(2, 'Other signer'), claimBundle(1, 'Route')],
    });

    expect(pickClaim(response, fingerprint(1), 5n)?.schemaName).toBe('Route');
  });

  it("skips another signer's claim at the same sequence", () => {
    const response = v2.GetVerificationClaimResponse.create({
      candidates: [claimBundle(2, 'Other signer')],
    });

    expect(pickClaim(response, fingerprint(1), 5n)).toBeNull();
  });
});

function claimBundle(signer: number, schemaName: string): v2.EventBundle {
  const schema = v2.VerificationSchema.create({ name: schemaName });
  const content = v2.Content.create({
    contentBody: {
      oneofKind: 'verificationClaim',
      verificationClaim: v2.VerificationClaim.create({
        schema: v2.SerializedVerificationSchema.create({
          schemaBytes: v2.VerificationSchema.toBinary(schema),
        }),
      }),
    },
  });
  const event = v2.Event.create({
    key: v2.EventKey.create({
      identity: IDENTITY,
      collection: 8,
      signedBy: v2.PublicKey.create({
        keyType: 1,
        key: new Uint8Array(8).fill(signer),
      }),
      sequence: 5n,
    }),
    createdAt: 1000n,
  });
  return v2.EventBundle.create({
    signedEvent: v2.SignedEvent.create({
      eventBytes: v2.Event.toBinary(event),
      signature: new Uint8Array([0]),
    }),
    serializedContent: v2.SerializedContent.create({
      contentBytes: v2.Content.toBinary(content),
    }),
  });
}

// `getKeyFingerprint` of a key made of eight `signer` bytes.
function fingerprint(signer: number): string {
  return signer.toString(16).padStart(2, '0').repeat(8);
}
