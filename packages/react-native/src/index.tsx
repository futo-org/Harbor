import 'fast-text-encoding';

// Side-effect: ubrn-generated TurboModule install + uniffi version check.
import './uniffi-init';

// rs-core's API: the protocol's records (with their factories), enums,
// queries and stateless helpers.
export * from './generated/rn/polycentric_core';
// The client and its JavaScript conveniences. Where names overlap, js-core's
// wrappers win.
// The protocol's records and enums, also as a namespace (`v2.Post`).
export * as v2 from './generated/rn/polycentric_core';
export * from '@polycentric/js-core';
export {
  generateWrappingKey,
  isIdentityKey,
  normalizeAlias,
  resolveAlias,
} from '@polycentric/js-core';
export type { QueryObserver } from '@polycentric/js-core';

export { createPolycentricClient } from './create-polycentric-client';
export type { CreatePolycentricClientConfig } from './create-polycentric-client';
