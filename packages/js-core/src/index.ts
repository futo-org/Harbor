export * as v1 from './proto/polycentric';
export type * as v1Types from './proto/polycentric';

export * as v2 from './proto/v2';
export type * as v2Types from './proto/v2';

// Re-export commonly used v1 types (namespaced v2 types don't conflict)
export {
  Process,
  Event,
  Events,
  SignedEvent,
  RangesForSystem,
  ContentType,
  Opinion,
  Pointer,
  Post,
  Delete,
  Claim,
  ClaimFieldEntry,
  ImageManifest,
} from './proto/polycentric';
export { PublicKey, KeyType } from './proto/polycentric/v2/keypair';

export type * from './platform-interfaces';

export { StorageHandle } from './storage';
export type { Repositories } from './storage';

export { PolycentricClient } from './polycentric-client';
export { IdentityManager } from './client-internal/identity-manager';
export { PairingSessionManager } from './client-internal/pairing-session-manager';
export type { ActivePairingSession } from './client-internal/pairing-session-manager';
export type {
  PolycentricClientConfig,
  KeyPair,
  PrivateKey,
  IdentityState,
} from './polycentric-client';

export * from './errors';
export * as Errors from './errors';
export * from './utils';
export * from './grpc';

export { KEY_TYPE, COLLECTION, HydrationStrategy } from './constants';

export {
  ClientState,
  InitializationStep,
  HydrationStatus,
} from './client-internal/event-service';
