import type { PolycentricClient } from '../polycentric-client';
import { polycentric, polycentric_ffi } from '../generated/protocol';
import { FeedQuery } from './feed-query';
import type { ModerationFilters } from '../utils';

export type SearchType = 'messages' | 'profiles';

function base64UrlEncode(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeFeedEvents(value: Uint8Array): {
  events: polycentric.ISignedEvent[];
  cursor: polycentric_ffi.ICursor | null;
} {
  const feedResult = polycentric_ffi.InternalFeedResult.decode(value);
  const eventsBytes = feedResult.result?.result ?? new Uint8Array();
  const events = polycentric.Events.decode(eventsBytes);
  return {
    events: events.events ?? [],
    cursor: feedResult.cursor ?? null,
  };
}

export class QueryManager {
  constructor(private readonly client: PolycentricClient) {}

  queryExploreFeed(
    perServerLimit?: number,
    moderationFilters?: ModerationFilters
  ): FeedQuery {
    const feedQuery = this._buildServerFeedQuery(
      perServerLimit ?? 20,
      moderationFilters
    );
    return new FeedQuery(async (cursor) => {
      const system = this.client.currentSystem;
      return this._fetchFeedPage(
        'Explore feed error',
        this.client.ffiBridge.queryExploreFeed(system, feedQuery, cursor)
      );
    });
  }

  querySearch(
    query: string,
    searchType?: SearchType,
    perServerLimit?: number,
    moderationFilters?: ModerationFilters
  ): FeedQuery {
    const feedQuery = this._buildServerFeedQuery(
      perServerLimit ?? 20,
      moderationFilters
    );
    const searchQuery: polycentric_ffi.ISearchQuery = {
      query,
      type:
        searchType === 'profiles'
          ? polycentric_ffi.SearchType.profiles
          : polycentric_ffi.SearchType.messages,
    };
    return new FeedQuery(async (cursor) => {
      const system = this.client.currentSystem;
      return this._fetchFeedPage(
        'Search error',
        this.client.ffiBridge.querySearchFeed(
          system,
          feedQuery,
          searchQuery,
          cursor
        )
      );
    });
  }

  queryFollowingFeed(limit?: number): FeedQuery {
    return new FeedQuery(async (cursor) => {
      const system = this.client.currentSystem;
      return this._fetchFeedPage(
        'Following feed error',
        Promise.resolve(
          this.client.ffiBridge.queryFollowingFeed(system, limit ?? 20, cursor)
        )
      );
    });
  }

  queryAuthorFeed(author: polycentric.IPublicKey, limit?: number): FeedQuery {
    return new FeedQuery(async (cursor) => {
      const system = this.client.currentSystem;
      return this._fetchFeedPage(
        'Author feed error',
        this.client.ffiBridge.queryAuthorFeed(
          system,
          author,
          limit ?? 200,
          cursor
        )
      );
    });
  }

  queryReferencesFeed(
    pointer: polycentric.IPointer,
    moderationFilters?: ModerationFilters
  ): FeedQuery {
    const reference: polycentric.IReference = {
      referenceType: 2,
      reference: polycentric.Pointer.encode(pointer).finish(),
    };
    const feedQuery = this._buildServerFeedQuery(100, moderationFilters);
    return new FeedQuery(async (cursor) => {
      const system = this.client.currentSystem;
      return this._fetchFeedPage(
        'References feed error',
        this.client.ffiBridge.queryReferencesFeed(
          system,
          feedQuery,
          reference,
          cursor
        )
      );
    });
  }

  queryLikesFeed(limit?: number): FeedQuery {
    return new FeedQuery(async (cursor) => {
      const system = this.client.currentSystem;
      return this._fetchFeedPage(
        'Likes feed error',
        Promise.resolve(
          this.client.ffiBridge.queryLikesFeed(system, limit ?? 20, cursor)
        )
      );
    });
  }

  queryCommentsFeed(moderationFilters?: ModerationFilters): FeedQuery {
    const feedQuery = this._buildServerFeedQuery(20, moderationFilters);
    return new FeedQuery(async (cursor) => {
      const system = this.client.currentSystem;
      return this._fetchFeedPage(
        'Comments feed error',
        this.client.ffiBridge.queryCommentsFeed(system, feedQuery, cursor)
      );
    });
  }

  queryCurrentOpinion(
    targetPointer: polycentric.IPointer
  ): polycentric.Opinion | null {
    const result = this.client.ffiBridge.queryOpinion(
      this.client.currentSystem,
      targetPointer
    );

    if (result.result === 'error' && result.error) {
      throw new Error(`Opinion query error: ${result.error}`);
    }

    if (result.value && result.value.length > 0) {
      const option = polycentric_ffi.Option.decode(result.value);
      if (option.value && option.value.length > 0) {
        const lwwElement = polycentric.LWWElement.decode(option.value);
        if (lwwElement.value && lwwElement.value.length > 0) {
          return (lwwElement.value[0] as polycentric.Opinion) ?? null;
        }
      }
    }

    return null;
  }

  async fetchEvent(
    system: polycentric.IPublicKey,
    process: polycentric.IProcess,
    logicalClock: number
  ): Promise<polycentric.ISignedEvent | null> {
    const servers = this.queryServers(this.client.currentSystem);

    const systemBytes = polycentric.PublicKey.encode(
      polycentric.PublicKey.create(system)
    ).finish();
    const rangesBytes = polycentric.RangesForSystem.encode(
      polycentric.RangesForSystem.create({
        rangesForProcesses: [
          {
            process,
            ranges: [{ low: logicalClock, high: logicalClock }],
          },
        ],
      })
    ).finish();

    const systemParam = base64UrlEncode(systemBytes);
    const rangesParam = base64UrlEncode(rangesBytes);

    for (const server of servers) {
      try {
        const url = `${server}/events?system=${systemParam}&ranges=${rangesParam}`;
        const response = await fetch(url, {
          headers: { 'Content-Type': 'application/octet-stream' },
        });
        if (response.ok) {
          const body = new Uint8Array(await response.arrayBuffer());
          const result = polycentric.Events.decode(body);
          if (result.events && result.events.length > 0) {
            return result.events[0]!;
          }
        }
      } catch {}
    }

    return null;
  }

  async queryPostStats(pointer: polycentric.IPointer) {
    const servers = this.queryServers(this.client.currentSystem);

    const request = polycentric.QueryReferencesRequest.create({
      reference: {
        referenceType: 2,
        reference: polycentric.Pointer.encode(
          polycentric.Pointer.create(pointer)
        ).finish(),
      },
      requestEvents: {
        countLwwElementReferences: [],
        countReferences: [],
      },
      countLwwElementReferences: [
        {
          value: new Uint8Array([polycentric.Opinion.LIKE]),
          fromType: polycentric.ContentType.OPINION,
        },
        {
          value: new Uint8Array([polycentric.Opinion.DISLIKE]),
          fromType: polycentric.ContentType.OPINION,
        },
      ],
      countReferences: [
        {
          fromType: polycentric.ContentType.POST,
        },
      ],
    });

    const queryBytes =
      polycentric.QueryReferencesRequest.encode(request).finish();
    const queryParam = base64UrlEncode(queryBytes);

    for (const server of servers) {
      try {
        const url = `${server}/query_references?query=${queryParam}`;
        const response = await fetch(url, {
          headers: { 'Content-Type': 'application/octet-stream' },
        });
        if (response.ok) {
          const body = new Uint8Array(await response.arrayBuffer());
          const result = polycentric.QueryReferencesResponse.decode(body);
          // counts order matches request order: [likes, dislikes, comments]
          return {
            likes: Number(result.counts?.[0] ?? 0),
            dislikes: Number(result.counts?.[1] ?? 0),
            comments: Number(result.counts?.[2] ?? 0),
          };
        }
      } catch {}
    }

    return { likes: 0, dislikes: 0, comments: 0 };
  }

  async queryReplies(
    pointer: polycentric.IPointer
  ): Promise<polycentric.ISignedEvent[]> {
    const feed = this.queryReferencesFeed(pointer);
    const items = await feed.read();
    return items.filter((item) => {
      const event = polycentric.Event.decode(item.event ?? new Uint8Array());
      return Number(event.contentType ?? 0) === polycentric.ContentType.POST;
    });
  }

  async queryUsername(
    authorPublicKey: polycentric.IPublicKey
  ): Promise<string | null> {
    const lwwElement = await this._querySystemCRDT(
      polycentric.ContentType.USERNAME,
      authorPublicKey
    );
    if (!lwwElement?.value) return null;
    return new TextDecoder().decode(lwwElement.value);
  }

  async queryDescription(
    authorPublicKey: polycentric.IPublicKey
  ): Promise<string | null> {
    const lwwElement = await this._querySystemCRDT(
      polycentric.ContentType.DESCRIPTION,
      authorPublicKey
    );
    if (!lwwElement?.value) return null;
    return new TextDecoder().decode(lwwElement.value);
  }

  async queryAvatar(
    authorPublicKey: polycentric.IPublicKey
  ): Promise<polycentric.IImageManifest | null> {
    const lwwElement = await this._querySystemCRDT(
      polycentric.ContentType.AVATAR,
      authorPublicKey
    );
    if (!lwwElement?.value) return null;
    return polycentric.ImageManifest.decode(lwwElement.value);
  }

  async queryBanner(
    authorPublicKey: polycentric.IPublicKey
  ): Promise<polycentric.IImageManifest | null> {
    const lwwElement = await this._querySystemCRDT(
      polycentric.ContentType.BANNER,
      authorPublicKey
    );
    if (!lwwElement?.value) return null;
    return polycentric.ImageManifest.decode(lwwElement.value);
  }

  queryIsDeleted(targetPointer: polycentric.IPointer): boolean {
    const result = this.client.ffiBridge.queryEventIsDeleted(targetPointer);

    if (result.result === 'error' && result.error) {
      throw new Error(`queryIsDeleted error: ${result.error}`);
    }

    if (result.value && result.value.length > 0) {
      return result.value[0] === 1;
    }

    return false;
  }

  queryFollows(system: polycentric.IPublicKey): polycentric.IPublicKey[] {
    const result = this.client.ffiBridge.queryFollowsForSystem(system);
    if (result.result === 'error' && result.error) {
      throw new Error(`queryFollows error: ${result.error}`);
    }
    return this._decodeSystemLWWElementSetEvents(
      result,
      (value) => polycentric.PublicKey.decode(value)
    );
  }

  queryBlocks(system: polycentric.IPublicKey): polycentric.IPublicKey[] {
    const result = this.client.ffiBridge.queryBlocksForSystem(system);
    if (result.result === 'error' && result.error) {
      throw new Error(`queryBlocks error: ${result.error}`);
    }
    return this._decodeSystemLWWElementSetEvents(
      result,
      (value) => polycentric.PublicKey.decode(value)
    );
  }

  queryServers(system: polycentric.IPublicKey): string[] {
    const result = this.client.ffiBridge.queryServersForSystem(system);
    if (result.result === 'error' && result.error) {
      throw new Error(`queryServers error: ${result.error}`);
    }
    return this._decodeSystemLWWElementSetEvents(
      result,
      (value) => new TextDecoder().decode(value)
    );
  }

  queryAuthorities(system: polycentric.IPublicKey): string[] {
    const result = this.client.ffiBridge.queryAuthoritiesForSystem(system);
    if (result.result === 'error' && result.error) {
      throw new Error(`queryAuthorities error: ${result.error}`);
    }
    return this._decodeSystemLWWElementSetEvents(
      result,
      (value) => new TextDecoder().decode(value)
    );
  }

  queryTopics(system: polycentric.IPublicKey): string[] {
    const result = this.client.ffiBridge.queryTopicsForSystem(system);
    if (result.result === 'error' && result.error) {
      throw new Error(`queryTopics error: ${result.error}`);
    }
    return this._decodeSystemLWWElementSetEvents(
      result,
      (value) => new TextDecoder().decode(value)
    );
  }

  private _decodeSystemLWWElementSetEvents<T>(
    result: polycentric_ffi.Result,
    decode: (value: Uint8Array) => T
  ): T[] {
    if (!result.value || result.value.length === 0) return [];

    const events = polycentric.Events.decode(result.value);
    const items: T[] = [];
    for (const signedEvent of events.events ?? []) {
      const event = polycentric.Event.decode(
        signedEvent.event ?? new Uint8Array()
      );
      if (!event.lwwElementSet?.value) continue;
      try {
        items.push(decode(event.lwwElementSet.value));
      } catch {}
    }
    return items;
  }


  queryFeed(
    _system: polycentric.IPublicKey,
    options: {
      startTime?: number;
      endTime?: number;
      limit?: number;
      cursor?: Uint8Array;
    } = {}
  ): { events: polycentric.ISignedEvent[]; cursor: Uint8Array } {
    const result = this.client.ffiBridge.queryFeedWithCursor({
      limit: options.limit ?? 20,
    });

    if (result.result === 'error' && result.error) {
      throw new Error(`queryFeed error: ${result.error}`);
    }

    if (result.value && result.value.length > 0) {
      const feedResult = polycentric.FeedResult.decode(result.value);
      return {
        events: feedResult.events ?? [],
        cursor: feedResult.cursor ?? new Uint8Array(),
      };
    }

    return { events: [], cursor: new Uint8Array() };
  }

  queryEvents(
    system: polycentric.IPublicKey,
    process: polycentric.IProcess,
    startClock: number,
    endClock: number
  ): polycentric.ISignedEvent[] {
    const result = this.client.ffiBridge.queryEvents(
      system,
      process,
      startClock,
      endClock
    );

    if (result.result === 'error' && result.error) {
      throw new Error(`queryEvents error: ${result.error}`);
    }

    if (result.value && result.value.length > 0) {
      const events = polycentric.Events.decode(result.value);
      return events.events ?? [];
    }

    return [];
  }

  eventPointer(event: polycentric.IEvent): polycentric.IPointer {
    const result = this.client.ffiBridge.getPointer(event);

    if (result.result === 'error' && result.error) {
      throw new Error(`eventPointer error: ${result.error}`);
    }

    return polycentric.Pointer.decode(result.value ?? new Uint8Array());
  }

  eventKey(event: polycentric.IEvent): Uint8Array {
    const pointer = this.eventPointer(event);
    const result = this.client.ffiBridge.getReference(pointer);

    if (result.result === 'error' && result.error) {
      throw new Error(`eventKey error: ${result.error}`);
    }

    return result.value ?? new Uint8Array();
  }

  private async _querySystemCRDT(
    contentType: polycentric.ContentType,
    systemPublicKey: polycentric.IPublicKey
  ): Promise<polycentric.ILWWElement | null> {
    const result = await this.client.ffiBridge.queryCrdtForSystem(
      systemPublicKey,
      contentType,
      this.client.currentSystem
    );

    if (result.result === 'error' && result.error) {
      throw new Error(`CRDT query error: ${result.error}`);
    }

    if (result.value && result.value.length > 0) {
      const option = polycentric_ffi.Option.decode(result.value);
      if (option.value && option.value.length > 0) {
        return polycentric.LWWElement.decode(option.value);
      }
    }

    return null;
  }


  private _buildServerFeedQuery(
    perServerLimit: number,
    moderationFilters?: ModerationFilters
  ): polycentric_ffi.IServerFeedQuery {
    return {
      perServerLimit,
      moderationFilters: moderationFilters
        ? JSON.stringify(moderationFilters)
        : undefined,
    };
  }

  private async _fetchFeedPage(
    errorPrefix: string,
    resultPromise: Promise<polycentric_ffi.Result>
  ): Promise<{
    items: polycentric.ISignedEvent[];
    cursor: polycentric_ffi.ICursor | null;
  }> {
    const result = await resultPromise;

    if (result.result === 'error' && result.error) {
      throw new Error(`${errorPrefix}: ${result.error}`);
    }

    if (result.value && result.value.length > 0) {
      const { events: items, cursor } = decodeFeedEvents(result.value);
      return { items, cursor };
    }

    return { items: [], cursor: null };
  }
}
