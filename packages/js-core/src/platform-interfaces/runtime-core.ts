import type { CommentsFeedState, ServerError } from '../utils/rust-types';

export interface ResultAndServerErrors {
  result: Uint8Array;
  errors: ServerError[];
}

export type GetHeadCallback = (
  server: string,
  system: Uint8Array,
) => Promise<Uint8Array>;

export type GetRangesCallback = (
  server: string,
  system: Uint8Array,
) => Promise<Uint8Array>;

export type GetEventsCallback = (
  server: string,
  system: Uint8Array,
  ranges: Uint8Array,
) => Promise<Uint8Array>;

export type PostEventsCallback = (
  server: string,
  events: Uint8Array,
) => Promise<void>;

export type PersistEventsCallback = (eventsBytes: Uint8Array) => Promise<void>;

export type GetExploreCallback = (
  server: string,
  cursor?: Uint8Array,
  limit?: number,
  moderationFilters?: string,
) => Promise<Uint8Array>;

export type GetSearchCallback = (
  server: string,
  searchQuery?: string,
  searchType?: string,
  cursor?: Uint8Array,
  limit?: number,
  moderationFilters?: string,
) => Promise<Uint8Array>;

export type GetQueryReferencesCallback = (
  server: string,
  request: Uint8Array,
  moderationFilters?: string,
) => Promise<Uint8Array>;

export type GetQueryLatestCallback = (
  server: string,
  system: Uint8Array,
  eventTypes: Uint8Array,
) => Promise<Uint8Array>;

export type SignEventCallback = (eventBytes: Uint8Array) => Promise<Uint8Array>;

export type GetNextLogicalClockCallback = () => Promise<bigint>;

export type PersistLogicalClockCallback = (
  logicalClock: bigint,
) => Promise<void>;

export interface IPolycentricCore {
  ingest_events(events: Uint8Array): void;
  create_event(
    eventCreationData: Uint8Array,
    signEvent: SignEventCallback,
    persistEvent: PersistEventsCallback,
    getNextLogicalClock: GetNextLogicalClockCallback,
    persistLogicalClock: PersistLogicalClockCallback,
  ): Promise<Uint8Array>;
  sync_events_for_system(
    system: Uint8Array,
    getHead: GetHeadCallback,
    getRanges: GetRangesCallback,
    getEvents: GetEventsCallback,
    postEvents: PostEventsCallback,
    persistEvents: PersistEventsCallback,
  ): Promise<ResultAndServerErrors>;
  query_explore_feed(
    system: Uint8Array,
    getExplore: GetExploreCallback,
    cursors: Map<string, Uint8Array>,
    perServerLimit?: number,
    moderationFilters?: string,
  ): Promise<ResultAndServerErrors>;
  query_explore_feed_specific_server(
    server: string,
    getExplore: GetExploreCallback,
    cursor?: Uint8Array,
    limit?: number,
    moderationFilters?: string,
  ): Promise<Uint8Array>;
  query_search(
    system: Uint8Array,
    getSearch: GetSearchCallback,
    searchQuery: string,
    searchType: string | undefined,
    cursors: Map<string, Uint8Array>,
    perServerLimit?: number,
    moderationFilters?: string,
  ): Promise<ResultAndServerErrors>;
  query_following_feed(
    system: Uint8Array,
    limit: number,
    latestEvent?: Uint8Array,
  ): Uint8Array;
  query_author_feed(
    currentSystem: Uint8Array,
    targetSystem: Uint8Array,
    limit: number,
    latestEvent: Uint8Array | undefined,
    getHead: GetHeadCallback,
    getRanges: GetRangesCallback,
    getEvents: GetEventsCallback,
  ): Promise<Uint8Array>;
  query_references_feed(
    system: Uint8Array,
    getQueryReferences: GetQueryReferencesCallback,
    reference: Uint8Array,
    cursors: Map<string, Uint8Array>,
    moderationFilters?: string,
  ): Promise<ResultAndServerErrors>;
  query_comments_feed(
    system: Uint8Array,
    getQueryReferences: GetQueryReferencesCallback,
    feedState: CommentsFeedState,
    moderationFilters?: string,
  ): Promise<ResultAndServerErrors>;
  query_likes_feed(
    system: Uint8Array,
    limit: number,
    latestEvent?: Uint8Array,
  ): Uint8Array;
  get_reference(pointerBytes: Uint8Array): Uint8Array | null | undefined;
  query_opinion(
    currentSystem: Uint8Array,
    targetPointerBytes: Uint8Array,
  ): Uint8Array | null | undefined;
  query_event_is_deleted(pointerBytes: Uint8Array): boolean;
  query_feed_with_cursor(
    systemBytes: Uint8Array,
    startTime?: bigint,
    endTime?: bigint,
    limit?: number,
    cursor?: Uint8Array,
  ): Uint8Array | null | undefined;
  query_follows_for_system(
    systemBytes: Uint8Array,
  ): Uint8Array | null | undefined;
  query_blocks_for_system(
    systemBytes: Uint8Array,
  ): Uint8Array | null | undefined;
  query_servers_for_system(
    systemBytes: Uint8Array,
  ): Uint8Array | null | undefined;
  query_authorities_for_system(
    systemBytes: Uint8Array,
  ): Uint8Array | null | undefined;
  query_topics_for_system(
    systemBytes: Uint8Array,
  ): Uint8Array | null | undefined;
  query_crdt_for_system(
    targetSystemBytes: Uint8Array,
    contentType: bigint,
    currentSystemBytes: Uint8Array,
    getQueryLatest: GetQueryLatestCallback,
  ): Promise<Uint8Array | null | undefined>;
  get_pointer(eventBytes: Uint8Array): Uint8Array;
  query_events(
    systemBytes: Uint8Array,
    processBytes: Uint8Array,
    startClock: bigint,
    endClock: bigint,
  ): Uint8Array;
}
