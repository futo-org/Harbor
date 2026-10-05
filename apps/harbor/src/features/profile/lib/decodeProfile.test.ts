// `@polycentric/react-native`'s barrel pulls in native uniffi init at import
// time, which can't run under jest. We only need the pure `v2` protobuf-ts
// namespace, so expose just that (sourced from js-core's generated protos).
jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
}));

import { eventKeyId } from '@/src/common/lib/polycentric-hooks/helpers';
import { v2 } from '@polycentric/react-native';
import { decodeProfile } from './decodeProfile';

const IDENTITY = 'someidentity';

function profileContent(
  fields: Partial<{
    name: string;
    description: string;
    alias: string;
    knownAs: v2.EventKey;
  }>,
): v2.Content {
  return v2.Content.create({
    contentBody: {
      oneofKind: 'profileUpdate',
      profileUpdate: v2.ProfileUpdate.create(fields),
    },
  });
}

function claimContent(): v2.Content {
  return v2.Content.create({
    contentBody: {
      oneofKind: 'verificationClaim',
      verificationClaim: v2.VerificationClaim.create(),
    },
  });
}

function verifyContent(claimEventKey: v2.EventKey): v2.Content {
  return v2.Content.create({
    contentBody: {
      oneofKind: 'verificationVerify',
      verificationVerify: v2.VerificationVerify.create({ claimEventKey }),
    },
  });
}

function bundle(content: v2.Content, sequence: number): v2.EventBundle {
  return keyedBundle(
    content,
    v2.EventKey.create({
      collection: 3,
      identity: IDENTITY,
      sequence: BigInt(sequence),
    }),
  );
}

function keyedBundle(content: v2.Content, key: v2.EventKey): v2.EventBundle {
  const event = v2.Event.create({ key, createdAt: 1000n });
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

function serializedResponse(
  bundles: v2.EventBundle[],
  counts?: { following: number; followers: number },
  hints: v2.EventBundle[] = [],
): Uint8Array {
  return v2.GetProfileResponse.toBinary(
    v2.GetProfileResponse.create({
      eventBundles: bundles,
      eventHints: hints.map((eventBundle) => ({ eventBundle })),
      followingCount: BigInt(counts?.following ?? 0),
      followersCount: BigInt(counts?.followers ?? 0),
    }),
  );
}

describe('decodeProfile', () => {
  it('extracts alias from a profile update', () => {
    const bytes = serializedResponse([
      bundle(profileContent({ name: 'Alice', alias: 'alice@domain.com' }), 1),
    ]);
    const decoded = decodeProfile(bytes);
    expect(decoded.name).toBe('Alice');
    expect(decoded.alias).toBe('alice@domain.com');
  });

  it('returns null alias when the field is absent', () => {
    const bytes = serializedResponse([
      bundle(profileContent({ name: 'Bob' }), 1),
    ]);
    expect(decodeProfile(bytes).alias).toBeNull();
  });

  it('extracts the known-as claim id', () => {
    const claimKey = v2.EventKey.create({
      collection: 8,
      identity: IDENTITY,
      sequence: 4n,
    });
    const bytes = serializedResponse([
      bundle(profileContent({ knownAs: claimKey }), 1),
    ]);
    expect(decodeProfile(bytes).knownAs).toBe(eventKeyId(claimKey));
  });

  it('returns a null known-as when the field is absent', () => {
    const bytes = serializedResponse([
      bundle(profileContent({ name: 'Bob' }), 1),
    ]);
    expect(decodeProfile(bytes).knownAs).toBeNull();
  });

  it('collects the known-as claim and its verifies from the hints', () => {
    const claimKey = v2.EventKey.create({
      collection: 8,
      identity: IDENTITY,
      sequence: 4n,
    });
    const otherClaimKey = v2.EventKey.create({ ...claimKey, sequence: 5n });
    const claim = keyedBundle(claimContent(), claimKey);
    const verify = keyedBundle(
      verifyContent(claimKey),
      v2.EventKey.create({ collection: 8, identity: 'verifier', sequence: 1n }),
    );
    const otherVerify = keyedBundle(
      verifyContent(otherClaimKey),
      v2.EventKey.create({ collection: 8, identity: 'verifier', sequence: 2n }),
    );
    const bytes = serializedResponse(
      [bundle(profileContent({ knownAs: claimKey }), 1)],
      undefined,
      [claim, verify, otherVerify],
    );
    expect(decodeProfile(bytes).knownAsClaimBundle).toEqual(
      v2.VerificationClaimBundle.create({ claim, verifies: [verify] }),
    );
  });

  it('ignores a known-as claim of another identity', () => {
    const claimKey = v2.EventKey.create({
      collection: 8,
      identity: 'someone-else',
      sequence: 4n,
    });
    const bytes = serializedResponse(
      [bundle(profileContent({ knownAs: claimKey }), 1)],
      undefined,
      [keyedBundle(claimContent(), claimKey)],
    );
    expect(decodeProfile(bytes).knownAsClaimBundle).toBeNull();
  });

  it('uses the highest-sequence update (latest wins)', () => {
    // The newer update (seq 2) omits the alias the older one (seq 1) set.
    const bytes = serializedResponse([
      bundle(profileContent({ alias: 'old@domain.com' }), 1),
      bundle(profileContent({ name: 'Newer' }), 2),
    ]);
    const decoded = decodeProfile(bytes);
    expect(decoded.name).toBe('Newer');
    expect(decoded.alias).toBeNull();
  });

  it('uses the last of two updates with the same sequence', () => {
    const bytes = serializedResponse([
      bundle(profileContent({ name: 'First' }), 1),
      bundle(profileContent({ name: 'Last' }), 1),
    ]);
    expect(decodeProfile(bytes).name).toBe('Last');
  });

  it('returns nulls for an empty response', () => {
    expect(decodeProfile(serializedResponse([])).alias).toBeNull();
  });

  it('caps pathological names at 50 characters', () => {
    const bytes = serializedResponse([
      bundle(profileContent({ name: 'x'.repeat(500) }), 1),
    ]);
    expect(decodeProfile(bytes).name).toBe(`${'x'.repeat(50)}…`);
  });

  it('extracts the follow counters', () => {
    const bytes = serializedResponse(
      [bundle(profileContent({ name: 'Alice' }), 1)],
      { following: 3, followers: 7 },
    );
    const decoded = decodeProfile(bytes);
    expect(decoded.followingCount).toBe(3);
    expect(decoded.followersCount).toBe(7);
  });

  it('defaults the counters to zero', () => {
    expect(decodeProfile(serializedResponse([])).followingCount).toBe(0);
    expect(decodeProfile(serializedResponse([])).followersCount).toBe(0);
  });
});
