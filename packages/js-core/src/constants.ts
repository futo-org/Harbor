export const KEY_TYPE = {
  ED25519: 1,
  SHA256: 2,
} as const;

/** Collection IDs matching the EventKey.collection proto field */
export const COLLECTION = {
  IDENTITY: 1,
  FEED: 2,
  INTERACTIONS: 3,
} as const;

/** A known COLLECTION value. Callers may also pass any number. */
export type Collection = (typeof COLLECTION)[keyof typeof COLLECTION];

export enum HydrationStrategy {
  FULL = 'full',
  FULL_ASYNC = 'full-async',
  HYBRID = 'hybrid',
  LAZY = 'lazy',
}

export const Defaults = {
  DB_NAME: 'polycentric-database',
  HYDRATION: {
    STRATEGY: HydrationStrategy.FULL,
    BATCH_SIZE: 100,
  },
  USER_AGENT: 'polycentric-core-ts',
  VERIFIER_SERVER: 'https://verify.polycentric.io',
  VERIFIER_ASSOCIATED_SERVERS: ['https://serv1.polycentric.io'],
} as const;
