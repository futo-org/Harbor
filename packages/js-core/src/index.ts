export * from './proto/polycentric';
export type * from './proto/polycentric';

export type * from './platform-interfaces';

export { StorageHandle } from './storage';
export type { Repositories } from './storage';

export type { DatabaseSchema } from './schemas/v1';
export { schemaV1 as polycentricSchema } from './schemas/v1';

export { PolycentricClient } from './polycentric-client';
export type {
  PolycentricClientConfig,
  KeyPair,
  Identity,
} from './polycentric-client';

export { FeedQuery, QueryManager } from './queries';

export * from './errors';
export * as Errors from './errors';
export * from './utils';

export { KEY_TYPE, HydrationStrategy } from './constants';

export {
  ClientState,
  InitializationStep,
  HydrationStatus,
} from './client-internal/event-service';
