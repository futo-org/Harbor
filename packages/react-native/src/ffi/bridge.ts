/**
 * Low-level FFI wrappers for the Polycentric Rust core.
 *
 * These functions provide a thin TypeScript layer over the C++ TurboModule,
 * handling ArrayBuffer conversion and protobuf decoding.
 */
import PolycentricCore from '../NativeReactNative';
import { polycentric, polycentric_ffi } from '../generated/protocol';
import {
  encodePublicKey,
  encodeProcess,
  encodePointer,
  encodeReference,
  encodeServerFeedQuery,
  encodeSearchQuery,
  encodeCursor,
  encodeEventCreationData,
  encodeSignedEvent,
  encodeEvent,
  encodeFeedQuery,
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
  cursor: polycentric_ffi.ICursor | null
): Promise<polycentric_ffi.Result> {
  const systemBuf = encodePublicKey(system);
  const authorBuf = encodePublicKey(author);
  const cursorBuf = encodeCursor(cursor);
  return resolveResultWithNetworkRequests((networkResponses) =>
    decodeResult(
      PolycentricCore.queryAuthorFeed(
        systemBuf,
        authorBuf,
        networkResponses,
        limit,
        cursorBuf
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
  cursor: polycentric_ffi.ICursor | null
): polycentric_ffi.Result {
  return decodeResult(
    PolycentricCore.queryFollowingFeed(
      encodePublicKey(system),
      limit,
      encodeCursor(cursor)
    )
  );
}

export function queryLikesFeed(
  system: polycentric.IPublicKey,
  limit: number,
  cursor: polycentric_ffi.ICursor | null
): polycentric_ffi.Result {
  return decodeResult(
    PolycentricCore.queryLikesFeed(
      encodePublicKey(system),
      limit,
      encodeCursor(cursor)
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
