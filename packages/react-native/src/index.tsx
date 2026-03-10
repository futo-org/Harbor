import 'fast-text-encoding';

export {
  polycentric as types,
  polycentric_ffi as types_ffi,
} from './generated/protocol';

export { PolycentricClient } from './polycentric-client';
export type {
  KeyPair,
  Identity,
  PolycentricClientConfig,
} from './polycentric-client';
export {
  EventService,
  ClientState,
  InitializationStep,
} from './client-internal/event-service';
export { StorageHandle } from './storage/storage-handle';
export { Database } from './storage/database';
export { FeedQuery } from './client-internal/feed-query';
export type { SearchType } from './client-internal/query-manager';
export * from './utils';

import * as FfiBridge from './ffi/bridge';
export { FfiBridge };
export { KEY_TYPE } from './crypto/crypto-manager';
export type { ICryptoManager } from './crypto/crypto-manager';
export { ReactNativeCryptoManager } from './crypto/react-native-crypto-manager';
