import 'react-native-get-random-values';
import type { PolycentricClient } from '@polycentric/js-core';
import { setLogger } from './generated/rn/polycentric_core';
import {
  createBatchingLogSink,
  createIdentity,
  type CreatePolycentricClientConfig,
} from './create-polycentric-client.shared';

let loggerInstalled = false;
function installConsoleLogger() {
  if (loggerInstalled) return;
  loggerInstalled = true;
  setLogger(createBatchingLogSink());
}

export async function createPolycentricClient(
  _config: CreatePolycentricClientConfig = {},
): Promise<PolycentricClient> {
  installConsoleLogger();
  throw new Error('TODO: support new login manager on native');
}

export { createIdentity };
export type { CreatePolycentricClientConfig };
