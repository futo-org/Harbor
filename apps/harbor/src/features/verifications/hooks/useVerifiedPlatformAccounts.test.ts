// `@polycentric/react-native`'s barrel pulls in native uniffi init at import
// time, which can't run under jest — expose just what the hook needs.
jest.mock('@polycentric/react-native', () => ({
  v2: jest.requireActual('../../../../../../packages/js-core/src/proto/v2'),
  FetchMode: { Default: 'Default', OfflineFirst: 'OfflineFirst' },
  Query: {
    ListVerificationClaims: function ListVerificationClaims() {},
  },
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

let mockVerifierBots: Set<string> | undefined;
jest.mock('./useVerifierIdentities', () => ({
  useVerifierIdentities: () => mockVerifierBots,
}));

let mockClaimsData: Uint8Array | undefined;
let mockIsLoading = false;
jest.mock('@/src/common/query/hooks/useQuery', () => ({
  useQuery: jest.fn(
    (_key: unknown, _query: unknown, _opts: unknown, enabled: boolean) => ({
      data: enabled ? mockClaimsData : undefined,
      isLoading: enabled && mockIsLoading,
      hasPendingRefresh: false,
      refresh: jest.fn(),
    }),
  ),
  RefreshStrategy: { Lazy: 'lazy' },
}));

import { eventKeyId } from '@/src/common/lib/polycentric-hooks/helpers';
import { v2 } from '@polycentric/react-native';
import { renderHook } from '@testing-library/react-native';
import { useVerifiedPlatformAccounts } from './useVerifiedPlatformAccounts';

const AUTHOR = 'author';
const BOT = 'bot';
const STRANGER = 'stranger';

beforeEach(() => {
  mockVerifierBots = new Set([BOT]);
  mockClaimsData = undefined;
  mockIsLoading = false;
});

describe('useVerifiedPlatformAccounts', () => {
  it('returns the platform and account of a claim verified by a trusted bot', async () => {
    const claim = platformClaim(1, 'github', 'alice');
    respond([
      {
        claim: claim.bundle,
        targets: [targetBundle([BOT])],
        verifies: [verifyBundle(BOT)],
      },
    ]);

    const { result } = await renderHook(() =>
      useVerifiedPlatformAccounts({ identity: AUTHOR }),
    );

    const { verifiedAccounts } = result.current;
    expect(verifiedAccounts).toHaveLength(1);
    expect(verifiedAccounts[0].claimId).toBe(claim.id);
    expect(verifiedAccounts[0].platform.slug).toBe('github');
    expect(verifiedAccounts[0].account).toBe('alice');
  });

  it('skips a non-platform claim', async () => {
    const claim = claimBundle(1, 'Freeform', { name: 'alice' });
    respond([
      {
        claim: claim.bundle,
        targets: [targetBundle([BOT])],
        verifies: [verifyBundle(BOT)],
      },
    ]);

    const { result } = await renderHook(() =>
      useVerifiedPlatformAccounts({ identity: AUTHOR }),
    );

    expect(result.current.verifiedAccounts).toEqual([]);
  });

  it('skips a platform claim without an account', async () => {
    const claim = claimBundle(1, 'Platform', { platform: 'github' });
    respond([
      {
        claim: claim.bundle,
        targets: [targetBundle([BOT])],
        verifies: [verifyBundle(BOT)],
      },
    ]);

    const { result } = await renderHook(() =>
      useVerifiedPlatformAccounts({ identity: AUTHOR }),
    );

    expect(result.current.verifiedAccounts).toEqual([]);
  });

  it('skips a claim verified only by an untrusted identity', async () => {
    const claim = platformClaim(1, 'github', 'alice');
    respond([
      {
        claim: claim.bundle,
        targets: [targetBundle([STRANGER])],
        verifies: [verifyBundle(STRANGER)],
      },
    ]);

    const { result } = await renderHook(() =>
      useVerifiedPlatformAccounts({ identity: AUTHOR }),
    );

    expect(result.current.verifiedAccounts).toEqual([]);
  });

  it('reports loading while the claims are loading', async () => {
    mockIsLoading = true;

    const { result } = await renderHook(() =>
      useVerifiedPlatformAccounts({ identity: AUTHOR }),
    );

    expect(result.current.isLoading).toBe(true);
  });

  it('keeps the accounts from the previous response while the claims refetch', async () => {
    mockIsLoading = true;
    const claim = platformClaim(1, 'github', 'alice');
    respond([
      {
        claim: claim.bundle,
        targets: [targetBundle([BOT])],
        verifies: [verifyBundle(BOT)],
      },
    ]);

    const { result } = await renderHook(() =>
      useVerifiedPlatformAccounts({ identity: AUTHOR }),
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.verifiedAccounts).toHaveLength(1);
  });

  it('reports loading while the verifier bots are loading or failed to load', async () => {
    mockVerifierBots = undefined;
    const claim = platformClaim(1, 'github', 'alice');
    respond([
      {
        claim: claim.bundle,
        targets: [targetBundle([STRANGER])],
        verifies: [verifyBundle(STRANGER)],
      },
    ]);

    const { result } = await renderHook(() =>
      useVerifiedPlatformAccounts({ identity: AUTHOR }),
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.verifiedAccounts).toEqual([]);
  });
});

function respond(claimBundles: v2.VerificationClaimBundle[]) {
  mockClaimsData = v2.ListVerificationClaimsResponse.toBinary(
    v2.ListVerificationClaimsResponse.create({ claimBundles }),
  );
}

function platformClaim(sequence: number, platform: string, account: string) {
  return claimBundle(sequence, 'Platform', { platform, account });
}

function claimBundle(
  sequence: number,
  schemaName: string,
  values: Record<string, string>,
): { id: string; bundle: v2.EventBundle } {
  const schema = v2.VerificationSchema.create({
    name: schemaName,
    fields: Object.keys(values).map((key) => ({
      key,
      kind: v2.FieldKind.STRING,
    })),
  });
  const fields: Record<string, Uint8Array> = {};
  for (const [key, value] of Object.entries(values)) {
    fields[key] = new TextEncoder().encode(value);
  }
  const key = v2.EventKey.create({
    identity: AUTHOR,
    collection: 8,
    sequence: BigInt(sequence),
  });
  return {
    id: eventKeyId(key),
    bundle: eventBundle(key, {
      oneofKind: 'verificationClaim',
      verificationClaim: {
        schema: { schemaBytes: v2.VerificationSchema.toBinary(schema) },
        fields,
      },
    }),
  };
}

function targetBundle(targetIdentities: string[]): v2.EventBundle {
  return eventBundle(
    v2.EventKey.create({ identity: AUTHOR, collection: 8, sequence: 99n }),
    {
      oneofKind: 'verificationTarget',
      verificationTarget: { targetIdentities },
    },
  );
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
