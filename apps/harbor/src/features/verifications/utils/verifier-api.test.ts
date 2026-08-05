// The provider module pulls in native init; the class takes its servers via
// the constructor, so the singleton's source can be stubbed out.
jest.mock('@/src/common/lib/polycentric-hooks/PolycentricProvider', () => ({
  DEFAULT_VERIFIER_SERVERS: ['http://stub'],
}));

import { VerifierApi } from './verifier-api';

const A = 'http://a';
const B = 'http://b';

// Minimal Response stand-in for the mocked fetch.
function response(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

/** URLs fetch was called with, in order. */
function fetched(): string[] {
  return fetchMock.mock.calls.map(([url]) => url as string);
}

describe('platformVerifiers', () => {
  it('unions verifier types across servers', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith(A)
        ? response([{ slug: 'x', verifiers: ['oauth'] }])
        : response([
            { slug: 'x', verifiers: ['text'] },
            { slug: 'youtube', verifiers: ['text'] },
          ]),
    );

    const api = new VerifierApi([A, B]);
    const verifiers = await api.platformVerifiers();
    expect([...(verifiers.get('x') ?? [])].sort()).toEqual(['oauth', 'text']);
    expect(verifiers.get('youtube')?.has('text')).toBe(true);
  });

  it('tolerates one unreachable server', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith(A)) throw new Error('offline');
      return response([{ slug: 'x', verifiers: ['oauth'] }]);
    });

    const api = new VerifierApi([A, B]);
    const verifiers = await api.platformVerifiers();
    expect(verifiers.get('x')?.has('oauth')).toBe(true);
  });

  it('caches the result for the session', async () => {
    fetchMock.mockResolvedValue(response([{ slug: 'x', verifiers: ['text'] }]));

    const api = new VerifierApi([A]);
    await api.platformVerifiers();
    await api.platformVerifiers();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws when no server is reachable, then retries', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    fetchMock.mockResolvedValueOnce(
      response([{ slug: 'x', verifiers: ['text'] }]),
    );

    const api = new VerifierApi([A]);
    await expect(api.platformVerifiers()).rejects.toThrow(
      'No verifier server reachable',
    );
    // The failure is not cached — the next call fetches again.
    const verifiers = await api.platformVerifiers();
    expect(verifiers.get('x')?.has('text')).toBe(true);
  });
});

describe('getClaimFieldsByUrl', () => {
  it('returns fields from the first server that answers', async () => {
    fetchMock.mockResolvedValue(response([{ key: 0, value: 'futo' }]));

    const api = new VerifierApi([A, B]);
    const fields = await api.getClaimFieldsByUrl('github', 'https://g.com/f');
    expect(fields).toEqual([{ key: 0, value: 'futo' }]);
    expect(fetched()).toEqual([
      'http://a/platforms/github/text/get-claim-fields-by-url',
    ]);
  });

  it('falls through to the next server on a network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    fetchMock.mockResolvedValueOnce(response([{ key: 0, value: 'futo' }]));

    const api = new VerifierApi([A, B]);
    const fields = await api.getClaimFieldsByUrl('github', 'https://g.com/f');
    expect(fields).toEqual([{ key: 0, value: 'futo' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats an error response as authoritative (no retry)', async () => {
    fetchMock.mockResolvedValue(
      response({ message: 'Failed to match regex' }, false, 500),
    );

    const api = new VerifierApi([A, B]);
    await expect(
      api.getClaimFieldsByUrl('github', 'https://bad'),
    ).rejects.toThrow('Failed to match regex');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('checkTextClaim', () => {
  it('resolves when the check passes', async () => {
    fetchMock.mockResolvedValue(response({ success: true }));

    const api = new VerifierApi([A]);
    await api.checkTextClaim('github', [{ key: 0, value: 'futo' }], 'token');
    expect(fetched()).toEqual(['http://a/platforms/github/text/check']);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      claimFields: [{ key: 0, value: 'futo' }],
      token: 'token',
    });
  });

  it('throws the server error message', async () => {
    fetchMock.mockResolvedValue(
      response({ message: 'Unable to find token' }, false, 500),
    );

    const api = new VerifierApi([A]);
    await expect(
      api.checkTextClaim('github', [{ key: 0, value: 'futo' }], 'token'),
    ).rejects.toThrow('Unable to find token');
  });
});

describe('requestTextVerify', () => {
  it('asks every server and resolves when at least one succeeds', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith(A)
        ? response({ message: 'nope' }, false, 500)
        : response({ verifyEventId: 'abc' }),
    );

    const api = new VerifierApi([A, B]);
    await api.requestTextVerify('github', 'claim-id');
    expect(fetched().sort()).toEqual([
      'http://a/platforms/github/text/verify',
      'http://b/platforms/github/text/verify',
    ]);
  });

  it('throws the first failure when every server fails', async () => {
    fetchMock.mockResolvedValue(response({ message: 'nope' }, false, 500));

    const api = new VerifierApi([A, B]);
    await expect(api.requestTextVerify('github', 'claim-id')).rejects.toThrow(
      'nope',
    );
  });
});

describe('OAuth flow', () => {
  it('getOAuthUrl skips servers without credentials', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith(A)
        ? response({ message: 'Verifier not configured' }, false, 500)
        : response({ url: 'https://x.com/oauth' }),
    );

    const api = new VerifierApi([A, B]);
    await expect(
      api.getOAuthUrl('x', 'https://app/oauth/callback'),
    ).resolves.toEqual({
      server: B,
      url: 'https://x.com/oauth',
    });
  });

  it('getOAuthToken stays on the session server', async () => {
    fetchMock.mockResolvedValue(response({ username: 'me', token: 't0k' }));

    const api = new VerifierApi([A, B]);
    const result = await api.getOAuthToken(B, 'x', 'data');
    expect(result).toEqual({ username: 'me', token: 't0k' });
    expect(fetched()).toEqual([
      'http://b/platforms/x/oauth/token?oauthData=data',
    ]);
  });

  it('checkOAuthClaim posts fields and challenge to the session server', async () => {
    fetchMock.mockResolvedValue(response({ success: true }));

    const api = new VerifierApi([A, B]);
    await api.checkOAuthClaim(B, 'x', [{ key: 0, value: 'me' }], 'ch4l');
    expect(fetched()).toEqual(['http://b/platforms/x/oauth/check']);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      claimFields: [{ key: 0, value: 'me' }],
      challengeResponse: 'ch4l',
    });
  });

  it('requestOAuthVerify passes the challenge as-is in the query', async () => {
    fetchMock.mockResolvedValue(response({ verifyEventId: 'abc' }));

    const api = new VerifierApi([A, B]);
    await api.requestOAuthVerify(B, 'x', 'claim-id', 'ch4l');
    expect(fetched()).toEqual([
      'http://b/platforms/x/oauth/verify?challengeResponse=ch4l',
    ]);
  });
});
