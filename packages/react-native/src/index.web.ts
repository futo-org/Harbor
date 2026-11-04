import 'fast-text-encoding';

// rs-core's API (see index.tsx). `uniffiInitAsync` loads the wasm module;
// creating a client does it for you.
export * from '@polycentric/rs-core-wasm/web';
// The protocol's records and enums, also as a namespace (`v2.Post`).
export * as v2 from '@polycentric/rs-core-wasm/web';
export * from '@polycentric/js-core';
export {
  generateWrappingKey,
  isIdentityKey,
  normalizeAlias,
  resolveAlias,
} from '@polycentric/js-core';
export type { QueryObserver } from '@polycentric/js-core';

export { createPolycentricClient } from './create-polycentric-client.web';
export type { CreatePolycentricClientConfig } from './create-polycentric-client.web';
