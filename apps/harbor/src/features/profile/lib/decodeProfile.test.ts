// `@polycentric/react-native`'s barrel pulls in native uniffi init at import
// time, which can't run under jest. We only need the pure `v2` protobuf-ts
// namespace, so expose just that (sourced from js-core's generated protos).
jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
  COLLECTION: { IDENTITY: 1 },
  labelsFromGetProfileResponse: () => mockLabelSets,
}));

import { v2 } from '@polycentric/react-native';
import type { LabelSet } from '@polycentric/react-native';
import { ffiEventKeyId as eventKeyId } from '@/src/common/lib/polycentric-hooks/helpers';
import { decodeProfile } from './decodeProfile';

const IDENTITY = 'someidentity';
const SIGNING_KEY = new Uint8Array([7]);
let mockLabelSets: LabelSet[] = [];

function profileContent(
  fields: Partial<{
    name: string;
    description: string;
    alias: string;
  }>,
): v2.Content {
  return v2.Content.create({
    contentBody: {
      oneofKind: 'profileUpdate',
      profileUpdate: v2.ProfileUpdate.create(fields),
    },
  });
}

function bundle(
  content: v2.Content,
  sequence: number,
  collection = 3,
): v2.EventBundle {
  const event = v2.Event.create({
    key: v2.EventKey.create({
      collection,
      identity: IDENTITY,
      signedBy: v2.PublicKey.create({ keyType: 1, key: SIGNING_KEY }),
      sequence: BigInt(sequence),
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

function serializedResponse(
  bundles: v2.EventBundle[],
  counts?: { following: number; followers: number },
  hints: v2.EventBundle[] = [],
): Uint8Array {
  return v2.GetProfileResponse.toBinary(
    v2.GetProfileResponse.create({
      eventBundles: bundles,
      eventHints: hints.map((eventBundle) =>
        v2.EventHint.create({ eventBundle }),
      ),
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

  it('targets the first identity event and collects the latest profile labels', () => {
    const target = (collection: number, sequence: bigint) => ({
      collection,
      identity: IDENTITY,
      signedBy: { keyType: 1, key: SIGNING_KEY.buffer as ArrayBuffer },
      sequence,
    });
    const labels = [{ value: 'hate', labeledBy: 'moderator' }];
    mockLabelSets = [
      { target: target(3, 1n), labels: [{ value: 'spam', labeledBy: 'x' }] },
      { target: target(3, 2n), labels },
    ];
    const decoded = decodeProfile(
      serializedResponse(
        [
          bundle(profileContent({ name: 'Alice' }), 1),
          bundle(profileContent({ name: 'Alice' }), 2),
        ],
        undefined,
        [bundle(v2.Content.create(), 1, 1)],
      ),
    );
    mockLabelSets = [];
    expect(decoded.eventId).toBe(eventKeyId(target(1, 1n)));
    expect(decoded.labels).toEqual(labels);
    expect(decodeProfile(serializedResponse([])).eventId).toBeNull();
  });
});
