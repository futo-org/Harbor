/**
 * The JSON-serializable type for the moderation_filters parameter which can be passed to various server endpoints
 */
export type ModerationFilters = {
  name: string;
  max_level: number;
  strict_mode: boolean;
}[];

/** Pagination state for a comments feed fanned out across servers. */
export type CommentsFeedState = {
  /** Serialized event the comments are attached to. */
  event?: Uint8Array;
  /** Opaque per-server pagination cursors, keyed by server URL. */
  cursors?: Map<string, Uint8Array>;
};

/** An error attributed to a particular server, if known. */
export interface ServerError {
  /** Server URL the error came from, when known. */
  server?: string;
  error: Error;
}
