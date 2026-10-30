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
export { bytesToHex, hexToBytes, toDigestKey } from './utils/hex';
export {
  FileStoreError,
  MAX_SEGMENT_BYTES,
  MAX_PATH_BYTES,
} from './platform-interfaces/file-store-driver';

export {
  StorageHandle,
  ContentStore,
  EventStore,
  LoginStore,
} from './data-store';
export type { Repositories } from './data-store';

export { PolycentricClient } from './polycentric-client';
export type { PolycentricClientConfig, KeyPair } from './polycentric-client';
export { FileStore } from './file-store';
export { MemoryStorageDriver, MemoryFileStoreDriver } from './memory-storage';

export { IdentityManager } from './client-internal/identity-manager';
export type {
  IdentityState,
  PublishArgs,
  IdentityUpdate,
  IdentityDraft,
} from './client-internal/identity-manager';

export { LoginManager } from './client-internal/login-manager';
export type {
  PendingLogin,
  SignupInfo,
} from './client-internal/login-manager';

export { ContentManager } from './client-internal/content-manager';

export {
  EventService,
  ClientState,
  InitializationStep,
  HydrationStatus,
} from './client-internal/event-service';
export type { ContentCreatedPayload } from './client-internal/event-service';

export {
  PairingSessionManager,
  PAIRING_SESSION_TTL_MILLIS,
} from './client-internal/pairing-session-manager';
export type { PairingSession } from './client-internal/pairing-session-manager';

export type {
  LoginId,
  LoginOverview,
  LoginDetails,
  LoginStatus,
  LoginRepositoryErrorCode,
  PrivateKeyLocation,
} from './platform-interfaces/login-repository';
export { LoginRepositoryError } from './platform-interfaces/login-repository';

export * from './errors';
export * as Errors from './errors';
export * from './utils';

export {
  KEY_TYPE,
  COLLECTION,
  HydrationStrategy,
  SyncStrategy,
} from './constants';
export type { Collection } from './constants';

export {
  resolveAlias,
  normalizeAlias,
  isIdentityKey,
} from './http/alias-resolver';
export { CryptoManager } from './crypto/crypto-manager';
export {
  createServerJwt,
  DEFAULT_EXPIRY_SECONDS,
  type ServerJwtClaims,
} from './crypto/server-jwt';
