import 'fast-text-encoding';

// Side-effect: ubrn-generated TurboModule install + uniffi version check.
import './uniffi-init';

export * from '@polycentric/js-core';
export * as types from '@polycentric/js-core';

export { PolycentricCore, QueryStatus } from './generated/rn/polycentric_core';
export type { FeedQueryResult } from './generated/rn/polycentric_core';

export {
  createPolycentricClient,
  createIdentity,
} from './create-polycentric-client';
export type { CreatePolycentricClientConfig } from './create-polycentric-client';
