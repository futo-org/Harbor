// `@polycentric/react-native`'s barrel pulls in native uniffi init at import
// time, which can't run under jest — expose just what the hook needs.
jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
}));

// ESM-only; jest-expo doesn't transform it. The digest content is irrelevant.
jest.mock('@noble/hashes/sha2.js', () => ({
  sha256: () => new Uint8Array(32),
}));

jest.mock('@/src/common/lib/polycentric-hooks/helpers', () => {
  const helpers = jest.requireActual(
    '@/src/common/lib/polycentric-hooks/helpers',
  );
  return {
    bytesToHex: helpers.bytesToHex,
    getKeyFingerprint: () => 'fingerprint',
    eventKeyId: helpers.eventKeyId,
  };
});

// useClaimById's query pulls in the toast portal, which jest can't load.
jest.mock('@/src/common/query/hooks/useQuery', () => ({}));

let mockKnownAsClaimBundle: v2.VerificationClaimBundle | null;
let mockIsProfileLoading: boolean;
jest.mock('./useProfile', () => ({
  useProfile: () => ({
    knownAsClaimBundle: mockKnownAsClaimBundle,
    alias: null,
    isLoading: mockIsProfileLoading,
  }),
}));

let mockVerifierBots: Set<string> | undefined;
jest.mock('../../verifications/hooks/useVerifierIdentities', () => ({
  useVerifierIdentities: () => mockVerifierBots,
}));

let mockCurrentIdentity: string | null;
jest.mock('@/src/common/lib/polycentric-hooks', () => ({
  useCurrentIdentity: () => ({
    isCurrentIdentity: (identity: string) => identity === mockCurrentIdentity,
  }),
}));

import { v2 } from '@polycentric/react-native';
import { renderHook } from '@testing-library/react-native';
import { useKnownAs } from './useKnownAs';

const AUTHOR = 'author';
const BOT = 'bot';
const STRANGER = 'stranger';

beforeEach(() => {
  mockKnownAsClaimBundle = null;
  mockIsProfileLoading = false;
  mockVerifierBots = new Set([BOT]);
  mockCurrentIdentity = null;
});

// The known-as hints carry the claim and its verifies, without the
// VerificationTarget events that request them.
describe('useKnownAs', () => {
  it('shows a claim verified by a trusted bot', async () => {
    mockKnownAsClaimBundle = knownAsBundle('github', [BOT]);

    const { result } = await renderHook(() => useKnownAs(AUTHOR));

    expect(result.current.knownAs?.platform.slug).toBe('github');
    expect(result.current.knownAs?.account).toBe('alice');
    expect(result.current.isLoading).toBe(false);
  });

  it('ignores a claim verified only by an untrusted identity', async () => {
    mockKnownAsClaimBundle = knownAsBundle('github', [STRANGER]);

    const { result } = await renderHook(() => useKnownAs(AUTHOR));

    expect(result.current.knownAs).toBeNull();
  });

  it('ignores a claim without verifies', async () => {
    mockKnownAsClaimBundle = knownAsBundle('github', []);

    const { result } = await renderHook(() => useKnownAs(AUTHOR));

    expect(result.current.knownAs).toBeNull();
  });

  it('reports loading and shows nothing while the verifier bots are unknown', async () => {
    mockVerifierBots = undefined;
    mockKnownAsClaimBundle = knownAsBundle('github', [STRANGER]);

    const { result } = await renderHook(() => useKnownAs(AUTHOR));

    expect(result.current.knownAs).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('shows your own claim without a verify', async () => {
    mockCurrentIdentity = AUTHOR;
    mockVerifierBots = undefined;
    mockKnownAsClaimBundle = knownAsBundle('github', []);

    const { result } = await renderHook(() => useKnownAs(AUTHOR));

    expect(result.current.knownAs?.account).toBe('alice');
    expect(result.current.isLoading).toBe(false);
  });

  it('ignores a verified claim for the Other platform', async () => {
    mockKnownAsClaimBundle = knownAsBundle('website', [BOT]);

    const { result } = await renderHook(() => useKnownAs(AUTHOR));

    expect(result.current.knownAs).toBeNull();
  });
});

function knownAsBundle(
  platform: string,
  verifiers: string[],
): v2.VerificationClaimBundle {
  const values: Record<string, string> = { platform, account: 'alice' };
  const schema = v2.VerificationSchema.create({
    name: 'Platform',
    fields: Object.keys(values).map((key) => ({
      key,
      kind: v2.FieldKind.STRING,
    })),
  });
  const fields: Record<string, Uint8Array> = {};
  for (const [key, value] of Object.entries(values)) {
    fields[key] = new TextEncoder().encode(value);
  }
  const claim = eventBundle(
    v2.EventKey.create({ identity: AUTHOR, collection: 8, sequence: 1n }),
    {
      oneofKind: 'verificationClaim',
      verificationClaim: {
        schema: { schemaBytes: v2.VerificationSchema.toBinary(schema) },
        fields,
      },
    },
  );
  return v2.VerificationClaimBundle.create({
    claim,
    verifies: verifiers.map(verifyBundle),
  });
}

// Only the verify's author matters for the status.
function verifyBundle(verifier: string): v2.EventBundle {
  return v2.EventBundle.create({
    signedEvent: v2.SignedEvent.create({
      eventBytes: v2.Event.toBinary(
        v2.Event.create({
          key: v2.EventKey.create({
            identity: verifier,
            collection: 8,
            sequence: 1n,
          }),
        }),
      ),
    }),
  });
}

function eventBundle(
  key: v2.EventKey,
  contentBody: v2.Content['contentBody'],
): v2.EventBundle {
  return v2.EventBundle.create({
    signedEvent: v2.SignedEvent.create({
      eventBytes: v2.Event.toBinary(v2.Event.create({ key, createdAt: 1000n })),
      signature: new Uint8Array([0]),
    }),
    serializedContent: v2.SerializedContent.create({
      contentBytes: v2.Content.toBinary(v2.Content.create({ contentBody })),
    }),
  });
}
