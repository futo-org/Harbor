/**
 * Low-level FFI wrappers for the Polycentric Rust core.
 *
 * These functions provide a thin TypeScript layer over the C++ TurboModule,
 * handling ArrayBuffer conversion and protobuf decoding.
 */
import type {
  CommentsFeedState,
  GetEventsCallback,
  GetExploreCallback,
  GetHeadCallback,
  GetQueryLatestCallback,
  GetQueryReferencesCallback,
  GetRangesCallback,
  GetSearchCallback,
  ICoreBridge,
  IPolycentricCore,
  PersistEventsCallback,
  PostEventsCallback,
  ResultAndServerErrors,
} from '@polycentric/js-core';
import PolycentricCore from '../NativeReactNative';
import { polycentric, polycentric_ffi } from '../generated/protocol';
import {
  encodeCursor,
  encodeEvent,
  encodeEventCreationData,
  encodeFeedQuery,
  encodePointer,
  encodeProcess,
  encodePublicKey,
  encodeReference,
  encodeSearchQuery,
  encodeServerFeedQuery,
  encodeSignedEvent,
} from '../utils/proto-encode';

function decodeResult(result: Object): polycentric_ffi.Result {
  return polycentric_ffi.Result.decode(result as Uint8Array);
}

function unwrapResult(result: polycentric_ffi.Result): Uint8Array {
  if (result.result !== 'value') {
    throw new Error(result.error ?? `Unexpected result: ${result.result}`);
  }
  return result.value ?? new Uint8Array(0);
}

// Encode network responses for the resolve loop
function encodeNetworkResponses(
  responses: polycentric_ffi.NetworkRequestResponses
): Uint8Array {
  return polycentric_ffi.NetworkRequestResponses.encode(responses).finish();
}

async function resolveResultWithNetworkRequests(
  queryFn: (networkResponses: Uint8Array) => polycentric_ffi.Result
): Promise<polycentric_ffi.Result> {
  let networkRequests = polycentric_ffi.NetworkRequestResponses.create({
    pairs: [],
  });

  while (true) {
    const result = queryFn(encodeNetworkResponses(networkRequests));

    if (result.result === 'requests' && result.requests) {
      const pairs = result.requests.pairs ?? [];
      networkRequests = await performNetworkRequests(pairs);
      continue;
    }

    return result;
  }
}

export function initialize(): void {
  unwrapResult(decodeResult(PolycentricCore.initializeCore()));
}

export function isInitialized(): boolean {
  const bytes = unwrapResult(decodeResult(PolycentricCore.isInitialized()));
  return bytes.length > 0 && bytes[0] === 1;
}

export function createEvent(
  eventData: polycentric.IEventCreationData,
  unixMs: number
): Uint8Array {
  return unwrapResult(
    decodeResult(
      PolycentricCore.createEvent(encodeEventCreationData(eventData), unixMs)
    )
  );
}

export function ingestEvent(signedEvent: polycentric.ISignedEvent): void {
  const encoded = encodeSignedEvent(signedEvent);
  const copy = new Uint8Array(encoded.length);
  copy.set(encoded);

  unwrapResult(decodeResult(PolycentricCore.ingestEvent(copy)));
}

export async function syncEventsForSystem(
  system: polycentric.IPublicKey
): Promise<polycentric_ffi.Result> {
  const systemBuf = encodePublicKey(system);
  return resolveResultWithNetworkRequests((networkResponses) =>
    decodeResult(
      PolycentricCore.syncEventsForSystem(systemBuf, networkResponses)
    )
  );
}

export async function queryExploreFeed(
  system: polycentric.IPublicKey,
  feedQuery: polycentric_ffi.IServerFeedQuery,
  cursor: polycentric_ffi.ICursor | null
): Promise<polycentric_ffi.Result> {
  const systemBuf = encodePublicKey(system);
  const feedQueryBuf = encodeServerFeedQuery(feedQuery);
  const cursorBuf = encodeCursor(cursor);
  return resolveResultWithNetworkRequests((networkResponses) =>
    decodeResult(
      PolycentricCore.queryExploreFeed(
        systemBuf,
        networkResponses,
        feedQueryBuf,
        cursorBuf
      )
    )
  );
}

export async function querySearchFeed(
  system: polycentric.IPublicKey,
  feedQuery: polycentric_ffi.IServerFeedQuery,
  searchQuery: polycentric_ffi.ISearchQuery,
  cursor: polycentric_ffi.ICursor | null
): Promise<polycentric_ffi.Result> {
  const systemBuf = encodePublicKey(system);
  const feedQueryBuf = encodeServerFeedQuery(feedQuery);
  const searchQueryBuf = encodeSearchQuery(searchQuery);
  const cursorBuf = encodeCursor(cursor);
  return resolveResultWithNetworkRequests((networkResponses) =>
    decodeResult(
      PolycentricCore.querySearchFeed(
        systemBuf,
        networkResponses,
        feedQueryBuf,
        searchQueryBuf,
        cursorBuf
      )
    )
  );
}

export async function queryAuthorFeed(
  system: polycentric.IPublicKey,
  author: polycentric.IPublicKey,
  limit: number,
  latestEvent?: Uint8Array
): Promise<polycentric_ffi.Result> {
  const systemBuf = encodePublicKey(system);
  const authorBuf = encodePublicKey(author);
  const latestEventBuf = latestEvent ?? new Uint8Array();
  return resolveResultWithNetworkRequests((networkResponses) =>
    decodeResult(
      PolycentricCore.queryAuthorFeed(
        systemBuf,
        authorBuf,
        networkResponses,
        limit,
        latestEventBuf
      )
    )
  );
}

export async function queryReferencesFeed(
  system: polycentric.IPublicKey,
  feedQuery: polycentric_ffi.IServerFeedQuery,
  reference: polycentric.IReference,
  cursor: polycentric_ffi.ICursor | null
): Promise<polycentric_ffi.Result> {
  const systemBuf = encodePublicKey(system);
  const feedQueryBuf = encodeServerFeedQuery(feedQuery);
  const referenceBuf = encodeReference(reference);
  const cursorBuf = encodeCursor(cursor);
  return resolveResultWithNetworkRequests((networkResponses) =>
    decodeResult(
      PolycentricCore.queryReferencesFeed(
        systemBuf,
        networkResponses,
        feedQueryBuf,
        referenceBuf,
        cursorBuf
      )
    )
  );
}

export async function queryCommentsFeed(
  system: polycentric.IPublicKey,
  feedQuery: polycentric_ffi.IServerFeedQuery,
  cursor: polycentric_ffi.ICursor | null
): Promise<polycentric_ffi.Result> {
  const systemBuf = encodePublicKey(system);
  const feedQueryBuf = encodeServerFeedQuery(feedQuery);
  const cursorBuf = encodeCursor(cursor);
  return resolveResultWithNetworkRequests((networkResponses) =>
    decodeResult(
      PolycentricCore.queryCommentsFeed(
        systemBuf,
        networkResponses,
        feedQueryBuf,
        cursorBuf
      )
    )
  );
}

export async function queryCrdtForSystem(
  targetSystem: polycentric.IPublicKey,
  contentType: polycentric.ContentType,
  currentSystem: polycentric.IPublicKey
): Promise<polycentric_ffi.Result> {
  const targetBuf = encodePublicKey(targetSystem);
  const currentBuf = encodePublicKey(currentSystem);
  return resolveResultWithNetworkRequests((networkResponses) =>
    decodeResult(
      PolycentricCore.queryCrdtForSystem(
        targetBuf,
        contentType,
        currentBuf,
        networkResponses
      )
    )
  );
}

// queryFollowingFeed and queryLikesFeed: the Rust FFI does not accept a
// networkRequests parameter, so we cannot run the network-resolution loop.

export function queryFollowingFeed(
  system: polycentric.IPublicKey,
  limit: number,
  latestEvent?: Uint8Array
): polycentric_ffi.Result {
  return decodeResult(
    PolycentricCore.queryFollowingFeed(
      encodePublicKey(system),
      limit,
      latestEvent ?? new Uint8Array()
    )
  );
}

export function queryLikesFeed(
  system: polycentric.IPublicKey,
  limit: number,
  latestEvent?: Uint8Array
): polycentric_ffi.Result {
  return decodeResult(
    PolycentricCore.queryLikesFeed(
      encodePublicKey(system),
      limit,
      latestEvent ?? new Uint8Array()
    )
  );
}

export function queryOpinion(
  currentSystem: polycentric.IPublicKey,
  targetPointer: polycentric.IPointer
): polycentric_ffi.Result {
  return decodeResult(
    PolycentricCore.queryOpinion(
      encodePublicKey(currentSystem),
      encodePointer(targetPointer)
    )
  );
}

export function queryEventIsDeleted(
  pointer: polycentric.IPointer
): polycentric_ffi.Result {
  return decodeResult(
    PolycentricCore.queryEventIsDeleted(encodePointer(pointer))
  );
}

export function queryFollowsForSystem(
  system: polycentric.IPublicKey
): polycentric_ffi.Result {
  return decodeResult(
    PolycentricCore.queryFollowsForSystem(encodePublicKey(system))
  );
}

export function queryBlocksForSystem(
  system: polycentric.IPublicKey
): polycentric_ffi.Result {
  return decodeResult(
    PolycentricCore.queryBlocksForSystem(encodePublicKey(system))
  );
}

export function queryServersForSystem(
  system: polycentric.IPublicKey
): polycentric_ffi.Result {
  return decodeResult(
    PolycentricCore.queryServersForSystem(encodePublicKey(system))
  );
}

export function queryAuthoritiesForSystem(
  system: polycentric.IPublicKey
): polycentric_ffi.Result {
  return decodeResult(
    PolycentricCore.queryAuthoritiesForSystem(encodePublicKey(system))
  );
}

export function queryTopicsForSystem(
  system: polycentric.IPublicKey
): polycentric_ffi.Result {
  return decodeResult(
    PolycentricCore.queryTopicsForSystem(encodePublicKey(system))
  );
}

export function queryFeedWithCursor(
  feedQuery: polycentric_ffi.IFeedQuery
): polycentric_ffi.Result {
  return decodeResult(
    PolycentricCore.queryFeedWithCursor(encodeFeedQuery(feedQuery))
  );
}

export function queryEvents(
  system: polycentric.IPublicKey,
  process: polycentric.IProcess,
  startClock: number,
  endClock: number
): polycentric_ffi.Result {
  return decodeResult(
    PolycentricCore.queryEvents(
      encodePublicKey(system),
      encodeProcess(process),
      startClock,
      endClock
    )
  );
}

export function getPointer(event: polycentric.IEvent): polycentric_ffi.Result {
  return decodeResult(PolycentricCore.getPointer(encodeEvent(event)));
}

export function getReference(
  pointer: polycentric.IPointer
): polycentric_ffi.Result {
  return decodeResult(PolycentricCore.getReference(encodePointer(pointer)));
}

export async function performNetworkRequests(
  pairs: polycentric_ffi.INetworkRequestResponse[]
): Promise<polycentric_ffi.NetworkRequestResponses> {
  for (const pair of pairs) {
    if (!pair.request) {
      continue;
    }

    const req = pair.request;
    const params = new URLSearchParams(
      (req.parameters ?? {}) as Record<string, string>
    );
    // Expected format: full URL without trailing slash
    // (e.g. http://localhost:8787 or https://serv1.polycentric.io).
    const server = req.server ?? '';
    const endpoint = '/' + req.endpoint;
    const queryString = params.toString();
    const url = `${server}${endpoint}${queryString ? '?' + queryString : ''}`;

    try {
      const fetchOptions: RequestInit = {
        method: req.method ?? 'GET',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      };

      if (req.body && req.body.length > 0) {
        fetchOptions.body = req.body.slice().buffer;
      }

      const response = await fetch(url, fetchOptions);

      if (response.ok) {
        const body = new Uint8Array(await response.arrayBuffer());
        pair.response = polycentric_ffi.NetworkResponse.create({ body });
      } else {
        pair.response = polycentric_ffi.NetworkResponse.create({});
      }
    } catch {
      pair.response = polycentric_ffi.NetworkResponse.create({});
    }
  }

  return polycentric_ffi.NetworkRequestResponses.create({ pairs });
}

// The cross-platform IPolycentricCore uses a Map<string, cursor>
// The FFI uses just one optional cursor.
// So the FFI bridge expects a map with zero or one members, using this key.
// Then that becomes the one optional cursor expected by the underlying function.
const MAP_CURSOR_KEY = '__native_cursor__';

function decodeServerErrors(
  errors: polycentric_ffi.IServerError[] | null | undefined
): ResultAndServerErrors['errors'] {
  return (errors ?? []).map((error) => ({
    server: error.server == null ? undefined : String(error.server),
    error: new Error(error.error ?? 'Unknown error'),
  }));
}

function getMapCursor(
  cursors: Map<string, Uint8Array>
): polycentric_ffi.ICursor | null {
  const cursor = cursors.get(MAP_CURSOR_KEY);
  return cursor ? { cursor } : null;
}

function setMapCursor(
  cursors: Map<string, Uint8Array>,
  cursor: polycentric_ffi.ICursor | null | undefined
) {
  if (cursor?.cursor && cursor.cursor.length > 0) {
    cursors.set(MAP_CURSOR_KEY, cursor.cursor);
  } else {
    cursors.delete(MAP_CURSOR_KEY);
  }
}

function decodeInternalFeedResult(result: polycentric_ffi.Result): {
  result: ResultAndServerErrors;
  cursor: polycentric_ffi.ICursor | null;
} {
  if (result.result === 'error') {
    throw new Error(result.error ?? 'Unknown FFI error');
  }

  if (!result.value || result.value.length === 0) {
    return {
      result: {
        result: new Uint8Array(),
        errors: [],
      },
      cursor: null,
    };
  }

  const feedResult = polycentric_ffi.InternalFeedResult.decode(result.value);
  return {
    result: {
      result: feedResult.result?.result ?? new Uint8Array(),
      errors: decodeServerErrors(feedResult.result?.errors),
    },
    cursor: feedResult.cursor ?? null,
  };
}

function decodeDirectResult(
  result: polycentric_ffi.Result
): ResultAndServerErrors {
  if (result.result === 'error') {
    throw new Error(result.error ?? 'Unknown FFI error');
  }

  if (!result.value || result.value.length === 0) {
    return {
      result: new Uint8Array(),
      errors: [],
    };
  }

  const value = polycentric_ffi.ResultAndServerErrors.decode(result.value);
  return {
    result: value.result ?? new Uint8Array(),
    errors: decodeServerErrors(value.errors),
  };
}

class NativePolycentricCore implements IPolycentricCore {
  ingest_events(events: Uint8Array): void {
    const decoded = polycentric.Events.decode(events);
    for (const event of decoded.events ?? []) {
      ingestEvent(event);
    }
  }

  async create_event(
    eventCreationData: Uint8Array,
    signEvent: (eventBytes: Uint8Array) => Promise<Uint8Array>,
    persistEvent: (eventsBytes: Uint8Array) => Promise<void>,
    getNextLogicalClock: () => Promise<bigint>,
    persistLogicalClock: (logicalClock: bigint) => Promise<void>
  ): Promise<Uint8Array> {
    const decoded = polycentric.EventCreationData.decode(eventCreationData);
    const logicalClock = await getNextLogicalClock();
    const unixMilliseconds = Date.now();

    decoded.logicalClock = Number(logicalClock);
    decoded.unixMilliseconds = unixMilliseconds;

    const eventBytes = createEvent(decoded, unixMilliseconds);
    const signedEventBytes = await signEvent(eventBytes);

    ingestEvent(polycentric.SignedEvent.decode(signedEventBytes));
    await persistEvent(signedEventBytes);
    await persistLogicalClock(logicalClock);

    return signedEventBytes;
  }

  async sync_events_for_system(
    system: Uint8Array,
    _getHead: GetHeadCallback,
    _getRanges: GetRangesCallback,
    _getEvents: GetEventsCallback,
    _postEvents: PostEventsCallback,
    _persistEvents: PersistEventsCallback
  ): Promise<ResultAndServerErrors> {
    return decodeDirectResult(
      await syncEventsForSystem(polycentric.PublicKey.decode(system))
    );
  }

  async query_explore_feed(
    system: Uint8Array,
    _getExplore: GetExploreCallback,
    cursors: Map<string, Uint8Array>,
    perServerLimit?: number,
    moderationFilters?: string
  ): Promise<ResultAndServerErrors> {
    const result = await queryExploreFeed(
      polycentric.PublicKey.decode(system),
      {
        perServerLimit,
        moderationFilters,
      },
      getMapCursor(cursors)
    );

    const decoded = decodeInternalFeedResult(result);
    setMapCursor(cursors, decoded.cursor);
    return decoded.result;
  }

  async query_explore_feed_specific_server(
    _server: string,
    _getExplore: GetExploreCallback,
    _cursor?: Uint8Array,
    _limit?: number,
    _moderationFilters?: string
  ): Promise<Uint8Array> {
    throw new Error(
      'query_explore_feed_specific_server is not implemented yet for FFI'
    );
  }

  async query_search(
    system: Uint8Array,
    _getSearch: GetSearchCallback,
    searchQuery: string,
    searchType: string | undefined,
    cursors: Map<string, Uint8Array>,
    perServerLimit?: number,
    moderationFilters?: string
  ): Promise<ResultAndServerErrors> {
    const result = await querySearchFeed(
      polycentric.PublicKey.decode(system),
      {
        perServerLimit,
        moderationFilters,
      },
      {
        query: searchQuery,
        type:
          searchType === 'profiles'
            ? polycentric_ffi.SearchType.profiles
            : polycentric_ffi.SearchType.messages,
      },
      getMapCursor(cursors)
    );

    const decoded = decodeInternalFeedResult(result);
    setMapCursor(cursors, decoded.cursor);
    return decoded.result;
  }

  query_following_feed(
    system: Uint8Array,
    limit: number,
    latestEvent?: Uint8Array
  ): Uint8Array {
    const result = queryFollowingFeed(
      polycentric.PublicKey.decode(system),
      limit,
      latestEvent
    );

    const decoded = decodeInternalFeedResult(result);
    return decoded.result.result;
  }

  async query_author_feed(
    currentSystem: Uint8Array,
    targetSystem: Uint8Array,
    limit: number,
    latestEvent: Uint8Array | undefined,
    _getHead: GetHeadCallback,
    _getRanges: GetRangesCallback,
    _getEvents: GetEventsCallback
  ): Promise<Uint8Array> {
    const result = await queryAuthorFeed(
      polycentric.PublicKey.decode(currentSystem),
      polycentric.PublicKey.decode(targetSystem),
      limit,
      latestEvent
    );

    const decoded = decodeInternalFeedResult(result);
    return decoded.result.result;
  }

  async query_references_feed(
    system: Uint8Array,
    _getQueryReferences: GetQueryReferencesCallback,
    reference: Uint8Array,
    cursors: Map<string, Uint8Array>,
    moderationFilters?: string
  ): Promise<ResultAndServerErrors> {
    const result = await queryReferencesFeed(
      polycentric.PublicKey.decode(system),
      {
        perServerLimit: 100,
        moderationFilters,
      },
      polycentric.Reference.decode(reference),
      getMapCursor(cursors)
    );

    const decoded = decodeInternalFeedResult(result);
    setMapCursor(cursors, decoded.cursor);
    return decoded.result;
  }

  async query_comments_feed(
    system: Uint8Array,
    _getQueryReferences: GetQueryReferencesCallback,
    feedState: CommentsFeedState,
    moderationFilters?: string
  ): Promise<ResultAndServerErrors> {
    const cursors = feedState.cursors ?? new Map<string, Uint8Array>();
    feedState.cursors = cursors;

    const result = await queryCommentsFeed(
      polycentric.PublicKey.decode(system),
      {
        perServerLimit: 20,
        moderationFilters,
      },
      getMapCursor(cursors)
    );

    const decoded = decodeInternalFeedResult(result);
    setMapCursor(cursors, decoded.cursor);
    return decoded.result;
  }

  query_likes_feed(
    system: Uint8Array,
    limit: number,
    latestEvent?: Uint8Array
  ): Uint8Array {
    const result = queryLikesFeed(
      polycentric.PublicKey.decode(system),
      limit,
      latestEvent
    );

    const decoded = decodeInternalFeedResult(result);
    return decoded.result.result;
  }

  get_reference(pointerBytes: Uint8Array): Uint8Array | null | undefined {
    const result = getReference(polycentric.Pointer.decode(pointerBytes));
    if (result.result === 'error') {
      throw new Error(result.error ?? 'Unknown FFI error');
    }
    return result.value ?? undefined;
  }

  query_opinion(
    currentSystem: Uint8Array,
    targetPointerBytes: Uint8Array
  ): Uint8Array | null | undefined {
    const result = queryOpinion(
      polycentric.PublicKey.decode(currentSystem),
      polycentric.Pointer.decode(targetPointerBytes)
    );

    if (result.result === 'error') {
      throw new Error(result.error ?? 'Unknown FFI error');
    }

    if (!result.value || result.value.length === 0) {
      return undefined;
    }

    const option = polycentric_ffi.Option.decode(result.value);
    return option.value ?? undefined;
  }

  query_event_is_deleted(pointerBytes: Uint8Array): boolean {
    const result = queryEventIsDeleted(
      polycentric.Pointer.decode(pointerBytes)
    );

    if (result.result === 'error') {
      throw new Error(result.error ?? 'Unknown FFI error');
    }

    return !!result.value?.[0];
  }

  query_feed_with_cursor(
    systemBytes: Uint8Array,
    startTime?: bigint,
    endTime?: bigint,
    limit?: number,
    cursor?: Uint8Array
  ): Uint8Array | null | undefined {
    const result = queryFeedWithCursor({
      systemBytes,
      startTime: startTime === undefined ? undefined : Number(startTime),
      endTime: endTime === undefined ? undefined : Number(endTime),
      limit,
      cursor,
    });

    if (result.result === 'error') {
      throw new Error(result.error ?? 'Unknown FFI error');
    }

    return result.value ?? undefined;
  }

  query_follows_for_system(
    systemBytes: Uint8Array
  ): Uint8Array | null | undefined {
    return unwrapQueryResult(
      queryFollowsForSystem(polycentric.PublicKey.decode(systemBytes))
    );
  }

  query_blocks_for_system(
    systemBytes: Uint8Array
  ): Uint8Array | null | undefined {
    return unwrapQueryResult(
      queryBlocksForSystem(polycentric.PublicKey.decode(systemBytes))
    );
  }

  query_servers_for_system(
    systemBytes: Uint8Array
  ): Uint8Array | null | undefined {
    return unwrapQueryResult(
      queryServersForSystem(polycentric.PublicKey.decode(systemBytes))
    );
  }

  query_authorities_for_system(
    systemBytes: Uint8Array
  ): Uint8Array | null | undefined {
    return unwrapQueryResult(
      queryAuthoritiesForSystem(polycentric.PublicKey.decode(systemBytes))
    );
  }

  query_topics_for_system(
    systemBytes: Uint8Array
  ): Uint8Array | null | undefined {
    return unwrapQueryResult(
      queryTopicsForSystem(polycentric.PublicKey.decode(systemBytes))
    );
  }

  async query_crdt_for_system(
    targetSystemBytes: Uint8Array,
    contentType: bigint,
    currentSystemBytes: Uint8Array,
    _getQueryLatest: GetQueryLatestCallback
  ): Promise<Uint8Array | null | undefined> {
    const result = await queryCrdtForSystem(
      polycentric.PublicKey.decode(targetSystemBytes),
      Number(contentType) as polycentric.ContentType,
      polycentric.PublicKey.decode(currentSystemBytes)
    );

    if (result.result === 'error') {
      throw new Error(result.error ?? 'Unknown FFI error');
    }

    if (!result.value || result.value.length === 0) {
      return undefined;
    }

    const option = polycentric_ffi.Option.decode(result.value);
    return option.value ?? undefined;
  }

  get_pointer(eventBytes: Uint8Array): Uint8Array {
    const result = getPointer(polycentric.Event.decode(eventBytes));
    if (result.result === 'error') {
      throw new Error(result.error ?? 'Unknown FFI error');
    }
    return result.value ?? new Uint8Array();
  }

  query_events(
    systemBytes: Uint8Array,
    processBytes: Uint8Array,
    startClock: bigint,
    endClock: bigint
  ): Uint8Array {
    const result = queryEvents(
      polycentric.PublicKey.decode(systemBytes),
      polycentric.Process.decode(processBytes),
      Number(startClock),
      Number(endClock)
    );

    if (result.result === 'error') {
      throw new Error(result.error ?? 'Unknown FFI error');
    }

    return result.value ?? new Uint8Array();
  }
}

function unwrapQueryResult(
  result: polycentric_ffi.Result
): Uint8Array | null | undefined {
  if (result.result === 'error') {
    throw new Error(result.error ?? 'Unknown FFI error');
  }

  return result.value ?? undefined;
}

export class NativeCoreBridge implements ICoreBridge {
  private core?: NativePolycentricCore;

  async initialize(): Promise<IPolycentricCore> {
    if (!this.core) {
      if (!isInitialized()) {
        initialize();
      }
      this.core = new NativePolycentricCore();
    }

    return this.core;
  }

  getCoreInstance(): IPolycentricCore {
    if (!this.core) {
      throw new Error('Native core is not initialized');
    }

    return this.core;
  }

  initialized(): boolean {
    return this.core !== undefined && isInitialized();
  }

  supportedOnPlatform(): boolean {
    return true;
  }
}
