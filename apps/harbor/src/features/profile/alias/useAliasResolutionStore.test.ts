import {
  forceResolveAlias,
  isAliasVerificationFailed,
  useAliasResolutionStore,
} from './useAliasResolutionStore';

// A format-valid identity: non-empty hex.
const HEX_IDENTITY =
  '0a2abecb223dbd572729018f8d201f32471e2a5b71e2032c052f6830846c4722';
const OTHER_HEX_IDENTITY = 'ab'.repeat(32);

let fetchMock: jest.Mock;

beforeEach(() => {
  useAliasResolutionStore.setState({
    identityByAlias: {},
    identityPromiseByAlias: {},
  });
  fetchMock = jest.fn();
  global.fetch = fetchMock;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('fetching an alias', () => {
  it('returns null for a malformed alias without hitting the network', async () => {
    await expect(resolveAlias('not-an-alias')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests the correct URL + Accept header and returns the identity', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ names: { test: HEX_IDENTITY } }),
    );

    await expect(resolveAlias('test@example.com')).resolves.toBe(HEX_IDENTITY);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.com/.well-known/polycentric.json');
    expect(init.headers.accept).toBe('application/json');
  });

  it('strips a leading @ and lowercases the domain and the names lookup', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ names: { test: HEX_IDENTITY } }),
    );

    await expect(resolveAlias('@Test@Example.com')).resolves.toBe(HEX_IDENTITY);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.com/.well-known/polycentric.json');
  });

  it('resolves a bare domain via the wildcard entry', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ names: { '*': HEX_IDENTITY } }));

    await expect(resolveAlias('example.com')).resolves.toBe(HEX_IDENTITY);
  });

  it('returns null on a non-2xx response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false));
    await expect(resolveAlias('test@example.com')).resolves.toBeNull();
  });

  it('returns null when fetch rejects (network error)', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(resolveAlias('test@example.com')).resolves.toBeNull();
  });

  it('returns null on an unparseable body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('bad json');
      },
    });
    await expect(resolveAlias('test@example.com')).resolves.toBeNull();
  });

  it('returns null on a null body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(null));
    await expect(resolveAlias('test@example.com')).resolves.toBeNull();
  });

  it('returns null when the alias is absent from the names map', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ names: { someoneelse: 'x' } }));
    await expect(resolveAlias('test@example.com')).resolves.toBeNull();
  });

  it('returns null when the identity is not valid hex', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ names: { test: 'not_hex_zz' } }),
    );
    await expect(resolveAlias('test@example.com')).resolves.toBeNull();
  });

  it('aborts and returns null when the request exceeds the timeout', async () => {
    jest.useFakeTimers();
    // A fetch that only settles when its abort signal fires.
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );

    const promise = resolveAlias('test@example.com');
    await jest.advanceTimersByTimeAsync(10_000);
    await expect(promise).resolves.toBeNull();
  });
});

describe('resolveAlias', () => {
  it('is pending until the request settles, then holds the identity', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ names: { test: HEX_IDENTITY } }),
    );

    resolveAlias('Test@Example.com');
    expect(identityOf('test@example.com')).toBeUndefined();

    await flushPromises();
    expect(identityOf('test@example.com')).toBe(HEX_IDENTITY);
  });

  it('makes one request for repeated calls, in flight or settled', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ names: { test: HEX_IDENTITY } }),
    );

    const first = resolveAlias('test@example.com');
    const second = resolveAlias('@Test@Example.com');
    expect(second).toBe(first);
    await flushPromises();
    await expect(resolveAlias('test@example.com')).resolves.toBe(HEX_IDENTITY);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caches failures', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    resolveAlias('test@example.com');
    await flushPromises();
    resolveAlias('test@example.com');

    expect(identityOf('test@example.com')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores a malformed alias', async () => {
    await expect(resolveAlias('not-an-alias')).resolves.toBeNull();

    const state = useAliasResolutionStore.getState();
    expect(state.identityByAlias).toEqual({});
    expect(state.identityPromiseByAlias).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('forceResolveAlias', () => {
  it('makes a new request and caches its result', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
    resolveAlias('test@example.com');
    await flushPromises();

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ names: { test: HEX_IDENTITY } }),
    );
    await expect(forceResolveAlias('test@example.com')).resolves.toBe(
      HEX_IDENTITY,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(identityOf('test@example.com')).toBe(HEX_IDENTITY);
  });

  it('keeps the cached identity until its own request settles', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ names: { test: HEX_IDENTITY } }),
    );
    resolveAlias('test@example.com');
    await flushPromises();

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ names: { test: OTHER_HEX_IDENTITY } }),
    );
    const forced = forceResolveAlias('test@example.com');
    expect(identityOf('test@example.com')).toBe(HEX_IDENTITY);

    await forced;
    expect(identityOf('test@example.com')).toBe(OTHER_HEX_IDENTITY);
  });

  it('shares the forced request with later calls', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ names: { test: HEX_IDENTITY } }),
    );

    const forced = forceResolveAlias('test@example.com');
    expect(resolveAlias('test@example.com')).toBe(forced);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores an older request settling after it', async () => {
    let resolveFirstFetch: (response: unknown) => void = () => {};
    fetchMock.mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirstFetch = resolve)),
    );
    resolveAlias('test@example.com');

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ names: { test: OTHER_HEX_IDENTITY } }),
    );
    await forceResolveAlias('test@example.com');

    resolveFirstFetch(jsonResponse({ names: { test: HEX_IDENTITY } }));
    await flushPromises();

    expect(identityOf('test@example.com')).toBe(OTHER_HEX_IDENTITY);
  });

  it('ignores an older request settling before it', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ names: { test: HEX_IDENTITY } }),
    );
    const older = resolveAlias('test@example.com');

    let resolveForcedFetch: (response: unknown) => void = () => {};
    fetchMock.mockImplementationOnce(
      () => new Promise((resolve) => (resolveForcedFetch = resolve)),
    );
    const forced = forceResolveAlias('test@example.com');

    await older;
    expect(identityOf('test@example.com')).toBeUndefined();

    resolveForcedFetch(jsonResponse({ names: { test: OTHER_HEX_IDENTITY } }));
    await forced;
    expect(identityOf('test@example.com')).toBe(OTHER_HEX_IDENTITY);
  });
});

describe('isAliasVerificationFailed', () => {
  it('is false while the alias is pending', () => {
    expect(isAliasVerificationFailed('test@example.com', HEX_IDENTITY)).toBe(
      false,
    );
  });

  it('is false when the alias resolved to the identity, in any case', () => {
    useAliasResolutionStore.setState({
      identityByAlias: { 'test@example.com': HEX_IDENTITY.toUpperCase() },
    });
    expect(isAliasVerificationFailed('test@example.com', HEX_IDENTITY)).toBe(
      false,
    );
  });

  it.each([
    ['nothing', null],
    ['another identity', OTHER_HEX_IDENTITY],
  ])('is true when the alias resolved to %s', (_, resolvedIdentity) => {
    useAliasResolutionStore.setState({
      identityByAlias: { 'test@example.com': resolvedIdentity },
    });
    expect(isAliasVerificationFailed('test@example.com', HEX_IDENTITY)).toBe(
      true,
    );
  });
});

function resolveAlias(alias: string) {
  return useAliasResolutionStore.getState().resolveAlias(alias);
}

function identityOf(normalizedAlias: string) {
  return useAliasResolutionStore.getState().identityByAlias[normalizedAlias];
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Build a fake Response with the given JSON body.
function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}
