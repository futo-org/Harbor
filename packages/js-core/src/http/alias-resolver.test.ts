import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeAlias, resolveAlias } from './alias-resolver';

// A format-valid identity: non-empty hex.
const HEX_IDENTITY =
  '0a2abecb223dbd572729018f8d201f32471e2a5b71e2032c052f6830846c4722';

describe('normalizeAlias', () => {
  it('canonicalises a plain alias', () => {
    expect(normalizeAlias('user@domain.com')).toBe('user@domain.com');
  });

  it('strips a single leading @', () => {
    expect(normalizeAlias('@user@domain.com')).toBe('user@domain.com');
  });

  it('lowercases local part and domain', () => {
    expect(normalizeAlias('User@Domain.COM')).toBe('user@domain.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeAlias('  user@domain.com  ')).toBe('user@domain.com');
  });

  it('accepts dotted local parts and multi-label domains', () => {
    expect(normalizeAlias('user.name@sub.domain.com')).toBe(
      'user.name@sub.domain.com',
    );
  });

  it.each([
    ['empty', ''],
    ['no @', 'nodomain'],
    ['empty local part', '@domain.com'],
    ['multiple @', 'a@@b.com'],
    ['single-label domain', 'user@localhost'],
    ['underscore in domain label', 'user@dom_ain.com'],
    ['hyphen-leading domain label', 'user@-domain.com'],
    ['space in local part', 'us er@domain.com'],
    ['disallowed local char (+)', 'user+tag@domain.com'],
  ])('rejects %s -> null', (_label, input) => {
    expect(normalizeAlias(input)).toBeNull();
  });
});

describe('resolveAlias', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  // Build a fake Response with the given JSON body.
  const jsonResponse = (body: unknown, ok = true) => ({
    ok,
    json: async () => body,
  });

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

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
    expect(url).toBe(
      'https://example.com/.well-known/polycentric.json?alias=test',
    );
    expect(init.headers.accept).toBe('application/json');
  });

  it('strips a leading @ and lowercases the local part in the request', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ names: { test: HEX_IDENTITY } }),
    );

    // Leading @ is dropped and the local part is lowercased; the domain host is
    // left as-is (DNS is case-insensitive).
    await resolveAlias('@Test@Example.com');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://Example.com/.well-known/polycentric.json?alias=test',
    );
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
    vi.useFakeTimers();
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
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(promise).resolves.toBeNull();
  });
});
