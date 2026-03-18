export const KEY_TYPE = {
  ED25519: BigInt(1),
  SHA256: BigInt(2),
} as const;

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
