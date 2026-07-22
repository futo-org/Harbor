---
title: Creating a verifier
sidebar_label: Creating a verifier
sidebar_position: 4
---

# Creating a verifier

A verifier is a class that extends one of the two base classes in
`services/verifier-bot/src/verifier.ts` and is exported as part of a `Platform`.
Add a file under `services/verifier-bot/src/platforms/` and register it in
`platforms.ts`.

Claim data is carried as `ClaimField`s (`{ key: number; value: string }`); most
platforms use a single field with `key: 0` holding the username/handle.

## Text verifier

Extend `TextVerifier` when ownership can be proven by the user placing their
token in a public bio/description. Implement `getText` (fetch the bio for a
claim field) and `getClaimFieldsByUrl` (derive claim fields from a profile URL).
Optional `testData*` arrays drive the `health-check` endpoint.

```typescript
import type { ClaimField, Platform } from '../models.js';
import { Result } from '../result.js';
import { createCookieEnabledAxios } from '../utility.js';
import {
  TextVerifier,
  type TextVerifierGetClaimFieldsTestData,
} from '../verifier.js';

class GithubTextVerifier extends TextVerifier {
  protected testDataGetClaimFields: TextVerifierGetClaimFieldsTestData[] = [
    { url: 'https://github.com/futo-org', expectedClaimFields: [{ key: 0, value: 'futo-org' }] },
  ];

  constructor() {
    super('GitHub');
  }

  protected async getText(claimField: ClaimField): Promise<Result<string>> {
    const client = createCookieEnabledAxios();
    const profile = await client({ url: `https://api.github.com/users/${claimField.value}` });
    if (profile.status !== 200) {
      return Result.err({ message: 'Unable to find your account' });
    }
    return Result.ok(profile.data.bio.trim());
  }

  public async getClaimFieldsByUrl(url: string): Promise<Result<ClaimField[]>> {
    const match = /https:\/\/(?:www\.)?github\.com\/([^/]+)\/?/.exec(url);
    if (!match) return Result.err({ message: 'Failed to match regex' });
    return Result.ok([{ key: 0, value: match[1] }]);
  }
}

export const Github: Platform = {
  name: 'GitHub',
  verifiers: [new GithubTextVerifier()],
  version: 1,
};
```

For platforms with anti-bot protection where a plain HTTP request won't return
the bio, fetch the page through the shared Puppeteer browser instead (see
`kick.ts`). Prefer a plain request whenever it works — the headless browser is
slower and less reliable.

## OAuth verifier

Extend `OAuthVerifier<T>` when the user proves ownership by signing in.
Implement `getOAuthURL` (where to send the user), `getToken` (exchange the OAuth
code, returning the authenticated username), and `isTokenValid` (confirm the
token's account matches the claim). Read credentials from
`process.env.POLYCENTRIC_VERIFIER_BOT_*`.

```typescript
import type { ClaimField, Platform, TokenResponse } from '../models.js';
import { Result } from '../result.js';
import { getCallbackForPlatform } from '../utility.js';
import { OAuthVerifier } from '../verifier.js';

type DiscordTokenRequest = { code: string };

class DiscordOAuthVerifier extends OAuthVerifier<DiscordTokenRequest> {
  constructor() {
    super('Discord');
  }

  public async getOAuthURL(): Promise<Result<string>> {
    const clientId = process.env.POLYCENTRIC_VERIFIER_BOT_DISCORD_CLIENT_ID;
    if (!clientId) return Result.errMsg('Verifier not configured');
    const redirectUri = getCallbackForPlatform(this.platform, true);
    return Result.ok(
      `https://discord.com/api/oauth2/authorize?client_id=${clientId}` +
        `&redirect_uri=${redirectUri}&response_type=code&scope=identify`,
    );
  }

  public async getToken(data: DiscordTokenRequest): Promise<Result<TokenResponse>> {
    // Exchange data.code for an access token, look up the account, and return
    // { username, token }.
  }

  public async isTokenValid(challenge: string, claimFields: ClaimField[]): Promise<Result<void>> {
    // Decode the token from `challenge`, fetch the account, and compare its
    // username to claimFields[0].value.
  }

  public healthCheck(): Promise<Result<void>> {
    throw new Error('Method not implemented.');
  }
}

export const Discord: Platform = {
  name: 'Discord',
  verifiers: [new DiscordOAuthVerifier()],
  version: 1,
};
```

See `discord.ts` for a complete `getToken` / `isTokenValid` implementation.

## Register the platform

Add the exported `Platform` to the `platforms` array in
`services/verifier-bot/src/platforms/platforms.ts`. Routes, `/platforms`
listings, and health checks are generated automatically from that array and
each verifier's `platform` name and `verifierType`.
