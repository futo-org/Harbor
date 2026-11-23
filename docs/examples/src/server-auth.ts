// Shown on docs/content/protocol/server-auth.md under "Client side".

import type { PolycentricClient } from '@polycentric/js-core';
// #region create-jwt
import { createServerJwt } from '@polycentric/js-core';

// #endregion create-jwt

export async function mintServerJwt(client: PolycentricClient) {
  // #region create-jwt
  if (!client.currentKeyPair || !client.activeIdentityKey) {
    throw new Error('Log in before minting a token');
  }

  const jwt = await createServerJwt({
    keyPair: client.currentKeyPair,
    iss: client.activeIdentityKey,
    aud: 'https://serv1.posts.futo.org',
  });
  // #endregion create-jwt
  return jwt;
}
