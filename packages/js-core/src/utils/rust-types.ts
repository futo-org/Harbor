/**
 * The JSON-serializable type for the moderation_filters parameter which can be passed to various server endpoints
 */
export type ModerationFilters = {
  name: string;
  max_level: number;
  strict_mode: boolean;
}[];

export type CommentsFeedState = {
  event?: Uint8Array;
  cursors?: Map<string, Uint8Array>;
};

export interface ServerError {
  server?: string;
  error: Error;
}
