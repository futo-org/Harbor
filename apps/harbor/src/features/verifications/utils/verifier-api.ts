import { DEFAULT_VERIFIER_SERVERS } from '@/src/common/lib/polycentric-hooks/PolycentricProvider';

// A claim field as the bot addresses it: by ordinal position in the claim
// schema's declared field order.
export interface VerifierClaimField {
  key: number;
  value: string;
}

export type VerifierType = 'text' | 'oauth';

// The bot can drive a headless browser against slow third parties.
const TIMEOUT_MS = 60_000;

// Error bodies are `{ message, extendedMessage }` (see the bot's writeResult).
async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) return body.message;
  } catch {
    // Not JSON — fall through to the status line.
  }
  return `Verifier request failed (${res.status})`;
}

/**
 * HTTP client for the verifier-bot service (services/verifier-bot), fanned
 * out over the configured servers.
 *
 * OAuth is the exception: the bot keeps OAuth session state in memory, so
 * url → token → check → verify must all hit the same server. `getOAuthUrl`
 * picks it and callers pass it along.
 */
export class VerifierApi {
  private readonly servers: string[];
  // Cached for the session.
  private verifiersPromise?: Promise<Map<string, Set<string>>>;
  private identitiesPromise?: Promise<Set<string>>;

  constructor(servers: string[]) {
    this.servers = servers;
  }

  private async request(
    server: string,
    path: string,
    init?: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(`${server}${path}`, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private post(server: string, path: string, body: unknown): Promise<Response> {
    return this.request(server, path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /**
   * Verifier types per platform slug, unioned across the configured servers.
   * Throws when no server is reachable.
   */
  platformVerifiers(): Promise<Map<string, Set<string>>> {
    this.verifiersPromise ??= this.fetchPlatformVerifiers().catch(
      (e: unknown) => {
        this.verifiersPromise = undefined; // Retry on the next call.
        throw e;
      },
    );
    return this.verifiersPromise;
  }

  /**
   * The Polycentric identities the configured bots publish verifications
   * under, unioned across the servers. Unreachable servers are skipped;
   * throws only when none answers, and retries on the next call.
   */
  verifierIdentities(): Promise<Set<string>> {
    this.identitiesPromise ??= this.fetchVerifierIdentities().catch(
      (e: unknown) => {
        this.identitiesPromise = undefined; // Retry on the next call.
        throw e;
      },
    );
    return this.identitiesPromise;
  }

  private async fetchVerifierIdentities(): Promise<Set<string>> {
    const results = await Promise.allSettled(
      this.servers.map(async (server) => {
        const res = await this.request(server, '/identity');
        if (!res.ok) throw new Error(await errorMessage(res));
        return (await res.json()) as { identity?: string };
      }),
    );
    if (!results.some((r) => r.status === 'fulfilled')) {
      throw new Error('No verifier server reachable');
    }
    const identities = new Set<string>();
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      if (result.value.identity) identities.add(result.value.identity);
    }
    return identities;
  }

  private async fetchPlatformVerifiers(): Promise<Map<string, Set<string>>> {
    const results = await Promise.allSettled(
      this.servers.map(async (server) => {
        const res = await this.request(server, '/platforms');
        if (!res.ok) throw new Error(await errorMessage(res));
        return (await res.json()) as { slug: string; verifiers?: string[] }[];
      }),
    );
    if (!results.some((r) => r.status === 'fulfilled')) {
      throw new Error('No verifier server reachable');
    }
    const verifiers = new Map<string, Set<string>>();
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const platform of result.value) {
        const types = verifiers.get(platform.slug) ?? new Set();
        for (const type of platform.verifiers ?? []) types.add(type);
        verifiers.set(platform.slug, types);
      }
    }
    return verifiers;
  }

  /**
   * Resolve a profile URL to the claim fields the platform's verifier proves.
   * First server that answers wins; an error response from a reachable server
   * is authoritative (the URL is bad), so it isn't retried elsewhere.
   */
  async getClaimFieldsByUrl(
    platformSlug: string,
    url: string,
  ): Promise<VerifierClaimField[]> {
    let lastError: Error = new Error('No verifier server reachable');
    for (const server of this.servers) {
      let res: Response;
      try {
        res = await this.post(
          server,
          `/platforms/${platformSlug}/text/get-claim-fields-by-url`,
          { url },
        );
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        continue;
      }
      if (!res.ok) throw new Error(await errorMessage(res));
      return (await res.json()) as VerifierClaimField[];
    }
    throw lastError;
  }

  /**
   * Pre-check without a claim: is the loop-back token in the profile?
   * Run before publishing so a missing link fails without creating anything.
   */
  async checkTextClaim(
    platformSlug: string,
    claimFields: VerifierClaimField[],
    token: string,
  ): Promise<void> {
    let lastError: Error = new Error('No verifier server reachable');
    for (const server of this.servers) {
      let res: Response;
      try {
        res = await this.post(server, `/platforms/${platformSlug}/text/check`, {
          claimFields,
          token,
        });
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        continue;
      }
      if (!res.ok) throw new Error(await errorMessage(res));
      return;
    }
    throw lastError;
  }

  /**
   * Ask every server to verify the claim (each bot publishes its own
   * VerificationVerify). Succeeds if any server does.
   */
  async requestTextVerify(
    platformSlug: string,
    claimId: string,
  ): Promise<void> {
    const results = await Promise.allSettled(
      this.servers.map(async (server) => {
        const res = await this.post(
          server,
          `/platforms/${platformSlug}/text/verify`,
          { claimId },
        );
        if (!res.ok) throw new Error(await errorMessage(res));
      }),
    );
    if (results.some((r) => r.status === 'fulfilled')) return;
    const first = results[0];
    throw first?.status === 'rejected'
      ? first.reason
      : new Error('No verifier server reachable');
  }

  /**
   * Sign-in URL, plus the server that owns the OAuth session. `redirect` is
   * where the bot's callback sends the browser afterwards; it must be on
   * the bot's allowed-callbacks list.
   */
  async getOAuthUrl(
    platformSlug: string,
    redirect: string,
  ): Promise<{ server: string; url: string }> {
    const query = `?redirect=${encodeURIComponent(redirect)}`;
    let lastError: Error = new Error('No verifier server reachable');
    for (const server of this.servers) {
      try {
        const res = await this.request(
          server,
          `/platforms/${platformSlug}/oauth/url${query}`,
        );
        if (!res.ok) throw new Error(await errorMessage(res));
        const { url } = (await res.json()) as { url: string };
        return { server, url };
      } catch (e) {
        // A server without this platform's OAuth credentials errors; another
        // configured server may still carry it.
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }
    throw lastError;
  }

  /** Exchange the OAuth callback data for the username and challenge token. */
  async getOAuthToken(
    server: string,
    platformSlug: string,
    oauthData: string,
  ): Promise<{ username: string; token: string }> {
    const res = await this.request(
      server,
      `/platforms/${platformSlug}/oauth/token?oauthData=${encodeURIComponent(
        oauthData,
      )}`,
    );
    if (!res.ok) throw new Error(await errorMessage(res));
    return (await res.json()) as { username: string; token: string };
  }

  /**
   * Pre-check without a claim: does the token's account match the fields?
   * Run before publishing so a mismatch fails without creating anything.
   */
  async checkOAuthClaim(
    server: string,
    platformSlug: string,
    claimFields: VerifierClaimField[],
    challengeResponse: string,
  ): Promise<void> {
    const res = await this.post(
      server,
      `/platforms/${platformSlug}/oauth/check`,
      { claimFields, challengeResponse },
    );
    if (!res.ok) throw new Error(await errorMessage(res));
  }

  /** Verify the claim with the challenge token from `getOAuthToken`. */
  async requestOAuthVerify(
    server: string,
    platformSlug: string,
    claimId: string,
    challengeResponse: string,
  ): Promise<void> {
    // The token is already URI-encoded by the bot (encodeObject); append as-is.
    const res = await this.post(
      server,
      `/platforms/${platformSlug}/oauth/verify?challengeResponse=${challengeResponse}`,
      { claimId },
    );
    if (!res.ok) throw new Error(await errorMessage(res));
  }
}

/** The app-wide instance, configured from the verifier-servers env var. */
export const verifierApi = new VerifierApi(DEFAULT_VERIFIER_SERVERS);
