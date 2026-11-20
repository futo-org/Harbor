// Shown on docs/content/developer/declaring-your-application.md.

import type { PolycentricClientConfig } from '@polycentric/js-core';
// #region js-application
import { PolycentricClient } from '@polycentric/js-core';

// #endregion js-application

export async function createClientWithApplication({
  core,
  storageDriver,
  filestoreDriver,
}: Pick<
  PolycentricClientConfig,
  'core' | 'storageDriver' | 'filestoreDriver'
>) {
  // #region js-application
  const client = await PolycentricClient.create({
    core,
    storageDriver,
    filestoreDriver,
    application: {
      name: 'My App',
      id: 'com.example.myapp',
      version: '1.2.0',
      url: 'https://myapp.example.com',
    },
  });
  // #endregion js-application
  return client;
}
