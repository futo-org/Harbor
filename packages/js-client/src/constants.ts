export const KEY_TYPE = {
  ED25519: 1,
  SHA256: 2,
} as const;

/** Collection IDs matching the EventKey.collection proto field */
export const COLLECTION = {
  IDENTITY: 1,
  FEED: 2,
  PROFILE: 3,
  INTERACTIONS: 4,
  GRAPH: 5,
  REPORTS: 6,
  LABELS: 7,
  VERIFICATIONS: 8,
} as const;

/** A known COLLECTION value. Callers may also pass any number. */
export type Collection = (typeof COLLECTION)[keyof typeof COLLECTION];

export enum HydrationStrategy {
  FULL = 'full',
  FULL_ASYNC = 'full-async',
  HYBRID = 'hybrid',
  LAZY = 'lazy',
}

/**
 * Specifies how to sync events and blobs for an identity between the local store
 * and the remote servers.
 */
export enum SyncStrategy {
  /** Push and pull all events. */
  FULL,
  /** Push all events. */
  FULL_PUSH,
  /** Pull all events. */
  FULL_PULL,
  /** Push and pull only events believed to be missing. */
  PARTIAL,
  /**
   * Push only events believed to be missing.
   * No events are pulled.
   */
  PARTIAL_PUSH,
  /**
   * Pull only events believed to be missing.
   * No events are pushed.
   */
  PARTIAL_PULL,
}

export const Defaults = {
  DB_NAME: 'polycentric-database',
  HYDRATION: {
    STRATEGY: HydrationStrategy.FULL,
    BATCH_SIZE: 100,
  },
  USER_AGENT: 'polycentric-core-ts',
} as const;
