jest.mock('@polycentric/react-native', () =>
  jest.requireActual('@/test/polycentric'),
);

import { v2 } from '@polycentric/react-native';
import { decodeProfile, isProfileResponseEmpty } from './decodeProfile';

const IDENTITY = 'someidentity';

function profileContent(
  fields: Partial<{
    name: string;
    description: string;
    alias: string;
  }>,
): v2.Content {
  return v2.Content.create({
    contentBody: new v2.ContentBody.ProfileUpdate({
      profileUpdate: v2.ProfileUpdate.create(fields),
    }),
  });
}

function bundle(content: v2.Content, sequence: number): v2.EventBundle {
  const event = v2.Event.create({
    key: v2.EventKey.create({
      collection: 3,
      identity: IDENTITY,
      sequence: BigInt(sequence),
    }),
    createdAt: 1000n,
  });
  return v2.EventBundle.create({
    signedEvent: v2.SignedEvent.create({
      event,
      signature: new Uint8Array([0]).buffer,
    }),
    serializedContent: v2.SerializedContent.create({ content }),
  });
}

function serializedResponse(
  bundles: v2.EventBundle[],
  counts?: { following: number; followers: number },
): v2.GetProfileResponse {
  return v2.GetProfileResponse.create({
    eventBundles: bundles,
    followingCount: BigInt(counts?.following ?? 0),
    followersCount: BigInt(counts?.followers ?? 0),
  });
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

  it('reports whether a response is empty', () => {
    expect(isProfileResponseEmpty(serializedResponse([]))).toBe(true);
    expect(
      isProfileResponseEmpty(
        serializedResponse([bundle(profileContent({ name: 'A' }), 1)]),
      ),
    ).toBe(false);
    expect(
      isProfileResponseEmpty(
        serializedResponse([], { following: 1, followers: 0 }),
      ),
    ).toBe(false);
  });
});
