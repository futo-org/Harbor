// Shown on docs/content/developer/examples.md under "Creating a client".

// #region node-client
import { createPolycentricNodeClient } from '@polycentric/js-node';

// #endregion node-client

export async function createNodeClient() {
  // #region node-client
  const client = await createPolycentricNodeClient({
    databasePath: './polycentric.db',
    blobDirectory: './polycentric-blobs',
    seedServers: ['http://localhost:3000'],
  });
  // #endregion node-client
  return client;
}
