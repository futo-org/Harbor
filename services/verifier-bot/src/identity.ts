import type { PolycentricClient } from '@polycentric/js-core';

/**
 * Create a new identity locally and activate it.
 * Caller is responsible for pushing it to remote servers.
 */
export async function createIdentity(client: PolycentricClient) {
  const { login, genesisEvent, identityContent } =
    await client.loginManager.beginSignup();
  await client.contentManager.save(identityContent);
  await client.commitEvent(genesisEvent, identityContent);
  await client.loginManager.finishSignup(login);
  await client.loginAs(login);
}
