/**
 * The Harbor client for JavaScript. A thin layer over rs-core: the client
 * itself, its async interface, and JavaScript errors. The protocol's types
 * (records like `Content` and `EventBundle`) come from the bindings; import
 * them, with their factories and enums, from the host package
 * (`@polycentric/react-native`) or `@polycentric/rs-core-wasm`.
 */
export { PolycentricClient } from './polycentric-client';
export type {
  AsyncHarbor,
  PendingEventRef,
  QueryObserver,
  QueryStream,
} from './harbor';
export { localHarbor } from './harbor';
export {
  generateWrappingKey,
  openLocalClient,
  wrappingKeyCipher,
  type LocalClientConfig,
} from './local';
export { registerBindings, type Bindings } from './bindings';
export * from './errors';
export { COLLECTION, type Collection } from './constants';
export { bytesToHex, hexToBytes } from './utils/hex';
export {
  isIdentityKey,
  normalizeAlias,
  resolveAlias,
} from './http/alias-resolver';
