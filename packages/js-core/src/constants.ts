/** Collection ids (`EventKey.collection`). */
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
