// Shown on docs/content/developer/examples.md under "Creating an identity".

import type { PolycentricClient } from '@polycentric/js-core';
// #region create-identity
import { SyncStrategy } from '@polycentric/js-core';

// #endregion create-identity

export async function ensureIdentity(client: PolycentricClient) {
  // #region create-identity
  if (!client.activeIdentityKey) {
    const { login, genesisEvent, identityContent, serializedContent } =
      await client.loginManager.beginSignup();
    await client.commitEvent({
      owner: login.identity,
      signedEvent: genesisEvent,
      content: identityContent,
      contentBytes: serializedContent.contentBytes,
    });
    await client.loginManager.finishSignup(login);
    await client.loginAs(login);
    await client.sync(SyncStrategy.PARTIAL_PUSH);
  }

  console.log('identity:', client.activeIdentityKey);
  // #endregion create-identity
}
