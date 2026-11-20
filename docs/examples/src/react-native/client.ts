// Shown on docs/content/developer/examples.md under "Creating a client" and
// "Creating an identity".

// #region rn-client
import { createPolycentricClient } from '@polycentric/react-native';

// #endregion rn-client
// #region rn-identity
import { createIdentity } from '@polycentric/react-native';

// #endregion rn-identity

export async function createReactNativeClient() {
  // #region rn-client
  const client = await createPolycentricClient({
    seedServers: ['http://localhost:3000'],
  });
  // #endregion rn-client

  // #region rn-identity
  if (!client.activeIdentityKey) {
    await createIdentity(client, 'http://localhost:3000');
  }
  // #endregion rn-identity

  return client;
}
