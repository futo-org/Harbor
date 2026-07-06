// `@polycentric/react-native`'s barrel pulls in native uniffi init at import
// time, which can't run under jest. We only need the pure `v2` protobuf-ts
// namespace, so expose just that (sourced from js-core's generated protos).
jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
}));

import { v2 } from '@polycentric/react-native';
import { decodeProfile } from './decodeProfile';

const IDENTITY = 'someidentity';

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
      eventBytes: v2.Event.toBinary(event),
      signature: new Uint8Array([0]),
    }),
    serializedContent: v2.SerializedContent.create({
      contentBytes: v2.Content.toBinary(content),
    }),
  });
}

function serializedResponse(bundles: v2.EventBundle[]): Uint8Array {
  return v2.ListEventsResponse.toBinary(
    v2.ListEventsResponse.create({ eventBundles: bundles }),
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
});
