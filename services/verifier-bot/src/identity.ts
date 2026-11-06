import type { PolycentricClient } from '@polycentric/js-core';

/**
 * Create a new identity locally and activate it.
 * Caller is responsible for pushing it to remote servers.
 */
export async function createIdentity(client: PolycentricClient) {
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
}
