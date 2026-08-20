import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import { isWeb } from '@/src/common/util/platform';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import type { Platform } from '../utils/platforms';
import { verifierApi } from '../utils/verifier-api';
import { publishVerifierBotTargets } from './useRequestVerification';
import { deleteClaim } from './useClaimActions';
import useCreateClaim, { type ClaimRef } from './useCreateClaim';
import { platformClaimParts } from './useVerifyPlatformClaim';

// The bot's callback redirects to
// `<web app url>/oauth/callback?state={"data":<base64>,"claimType":<slug>}`;
// the auth session hands that URL back here.
function oauthDataFromCallbackUrl(url: string): string {
  const { queryParams } = Linking.parse(url);
  const state = queryParams?.state;
  if (typeof state !== 'string') {
    throw new Error('Sign-in did not return OAuth data');
  }
  const { data } = JSON.parse(state) as { data?: string };
  if (!data) {
    throw new Error('Sign-in did not return OAuth data');
  }
  return data;
}

/**
 * Send the user to the platform's sign-in and exchange the callback for the
 * account name and challenge token. Later calls must stay on the returned
 * server — it owns the OAuth session.
 */
export async function oauthSignIn(
  platform: Platform,
): Promise<{ server: string; username: string; token: string }> {
  // The bot's callback redirects here. On web that's this origin so the
  // pop-up can hand the URL back; on native it must be the app's own scheme
  // — the auth session only auto-closes on a redirect to it.
  const returnUrl = isWeb
    ? `${window.location.origin}/oauth/callback`
    : Linking.createURL('oauth/callback');
  const { server, url } = await verifierApi.getOAuthUrl(
    platform.slug,
    returnUrl,
  );

  const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
  if (result.type !== 'success') {
    throw new Error('Sign-in was cancelled');
  }

  const oauthData = oauthDataFromCallbackUrl(result.url);
  const { username, token } = await verifierApi.getOAuthToken(
    server,
    platform.slug,
    oauthData,
  );
  return { server, username, token };
}

/**
 * The OAuth flow: sign in to the platform, check the token, publish the
 * claim for the authenticated account, then have the server verify it.
 */
export default function useOAuthVerifyPlatformClaim() {
  const client = usePolycentric();
  const createClaim = useCreateClaim();
  const [isPending, setPending] = useState(false);

  return {
    isPending,
    submit: async ({ platform }: { platform: Platform }): Promise<ClaimRef> => {
      if (isPending) {
        throw 'Already pending';
      }
      setPending(true);
      try {
        const { server, username, token } = await oauthSignIn(platform);

        // Check the token before publishing anything.
        await verifierApi.checkOAuthClaim(
          server,
          platform.slug,
          [{ key: 0, value: username }],
          token,
        );

        // One account field: the authenticated username. The profile URL is
        // derived from it where the platform has one.
        const { schema, values } = platformClaimParts(
          platform,
          [{ key: 0, value: username }],
          platform.profileUrl?.(username),
        );
        const ref = await createClaim.submit({ schema, values });
        if (!ref) {
          throw new Error('Failed to create the claim');
        }

        // Verify needs the claim published; roll it back on failure so
        // retries don't pile up claims.
        try {
          await publishVerifierBotTargets(client, ref.id);
          await verifierApi.requestOAuthVerify(
            server,
            platform.slug,
            ref.id,
            token,
          );
        } catch (e) {
          await deleteClaim(client, ref.id).catch(() => {});
          invalidateQuery(client, ['claims-list', ref.identity]);
          throw e;
        }

        // The bot's verify is now on the servers; refresh the claim's status.
        invalidateQuery(client, ['verification-verifies', ref.id]);
        return ref;
      } finally {
        setPending(false);
      }
    },
  };
}
