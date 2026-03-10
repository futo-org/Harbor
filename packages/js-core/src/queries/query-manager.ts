import { CommentsFeedState, ModerationFilters, ServerError } from '../utils';
import type { PolycentricClient } from '../polycentric-client';
import {
  ContentType,
  LWWElement,
  Pointer,
  PublicKey,
  Event as ProtobufEvent,
  FeedResult,
  ImageManifest,
  Events,
  ResultEventsAndRelatedEventsAndCursor,
  Reference,
  EventKey,
} from '../proto/polycentric';
import { FeedQuery } from './feed-query';

interface ResultAndServerErrors {
  result: Uint8Array;
  errors: ServerError[];
}

export class QueryManager {
  constructor(private readonly client: PolycentricClient) {}

  queryExploreFeed(
    perServerLimit?: number,
    moderationFilters?: ModerationFilters,
  ): FeedQuery {
    const currentSystem = this.client.currentIdentity.keyPair.publicKey;
    const currentSystemBytes = PublicKey.toBinary(currentSystem);

    const filters = moderationFilters
      ? JSON.stringify(moderationFilters)
      : null;
    const getExploreCallback = this.client.httpClient.getExplore.bind(
      this.client.httpClient,
    );

    return new FeedQuery(this.client, async (cursors, _latestEvent) => {
      const result = (await this.client.wasmCore.query_explore_feed(
        currentSystemBytes,
        getExploreCallback,
        cursors,
        perServerLimit,
        filters,
      )) as ResultAndServerErrors;

      return {
        events: Events.fromBinary(result.result),
        errors: result.errors,
      };
    });
  }

  queryExploreFeedSpecificServer(
    server: string,
    limit?: number,
    moderationFilters?: ModerationFilters,
  ): FeedQuery {
    const filters = moderationFilters
      ? JSON.stringify(moderationFilters)
      : null;
    const getExploreCallback = this.client.httpClient.getExplore.bind(
      this.client.httpClient,
    );

    return new FeedQuery(this.client, async (cursors, _latestEvent) => {
      const response =
        await this.client.wasmCore.query_explore_feed_specific_server(
          server,
          getExploreCallback,
          cursors.get(server),
          limit,
          filters,
        );

      const result = ResultEventsAndRelatedEventsAndCursor.fromBinary(response);

      if (result.cursor) cursors.set(server, result.cursor);

      return {
        events: result.resultEvents || { events: [] },
        errors: [],
      };
    });
  }

  querySearch(
    searchQuery: string,
    searchType?: 'messages' | 'profiles',
    perServerLimit?: number,
    moderationFilters?: ModerationFilters,
  ): FeedQuery {
    const currentSystem = this.client.currentIdentity.keyPair.publicKey;
    const currentSystemBytes = PublicKey.toBinary(currentSystem);

    const getSearchCallback = this.client.httpClient.getSearch.bind(
      this.client.httpClient,
    );

    const filters = moderationFilters
      ? JSON.stringify(moderationFilters)
      : null;

    return new FeedQuery(this.client, async (cursors, _latestEvent) => {
      const result = (await this.client.wasmCore.query_search(
        currentSystemBytes,
        getSearchCallback,
        searchQuery,
        searchType,
        cursors,
        perServerLimit,
        filters,
      )) as ResultAndServerErrors;

      return {
        events: Events.fromBinary(result.result),
        errors: result.errors,
      };
    });
  }

  queryFollowingFeed(limit: number): FeedQuery {
    const currentSystem = this.client.currentIdentity.keyPair.publicKey;
    const currentSystemBytes = PublicKey.toBinary(currentSystem);

    return new FeedQuery(this.client, async (_cursors, latestEvent) => {
      const latestEventBytes = latestEvent
        ? ProtobufEvent.toBinary(latestEvent)
        : undefined;

      const result = this.client.wasmCore.query_following_feed(
        currentSystemBytes,
        limit,
        latestEventBytes,
      );

      return {
        events: Events.fromBinary(result),
        errors: [],
      };
    });
  }

  queryAuthorFeed(profile: PublicKey, limit: number): FeedQuery {
    const currentSystem = this.client.currentIdentity.keyPair.publicKey;
    const currentSystemBytes = PublicKey.toBinary(currentSystem);

    const profileBytes = PublicKey.toBinary(profile);

    const getHeadCallback = this.client.httpClient.getHead.bind(
      this.client.httpClient,
    );
    const getRangesCallback = this.client.httpClient.getRanges.bind(
      this.client.httpClient,
    );
    const getEventsCallback = this.client.httpClient.getEvents.bind(
      this.client.httpClient,
    );

    return new FeedQuery(this.client, async (_cursors, latestEvent) => {
      const latestEventBytes = latestEvent
        ? ProtobufEvent.toBinary(latestEvent)
        : undefined;

      const result = await this.client.wasmCore.query_author_feed(
        currentSystemBytes,
        profileBytes,
        limit,
        latestEventBytes,
        getHeadCallback,
        getRangesCallback,
        getEventsCallback,
      );

      return {
        events: Events.fromBinary(result),
        errors: [],
      };
    });
  }

  queryReferencesFeed(
    reference: Reference,
    moderationFilters?: ModerationFilters,
  ): FeedQuery {
    const currentSystem = this.client.currentIdentity.keyPair.publicKey;
    const currentSystemBytes = PublicKey.toBinary(currentSystem);

    const getQueryReferencesCallback =
      this.client.httpClient.getQueryReferences.bind(this.client.httpClient);

    const referenceBytes = Reference.toBinary(reference);
    const filters = moderationFilters
      ? JSON.stringify(moderationFilters)
      : null;

    return new FeedQuery(this.client, async (cursors, _latestEvent) => {
      const result = await this.client.wasmCore.query_references_feed(
        currentSystemBytes,
        getQueryReferencesCallback,
        referenceBytes,
        cursors,
        filters,
      );

      return {
        events: Events.fromBinary(result.result),
        errors: result.errors,
      };
    });
  }

  queryLikesFeed(limit: number): FeedQuery {
    const currentSystem = this.client.currentIdentity.keyPair.publicKey;
    const currentSystemBytes = PublicKey.toBinary(currentSystem);

    return new FeedQuery(this.client, async (_cursors, latestEvent) => {
      const latestEventBytes = latestEvent
        ? ProtobufEvent.toBinary(latestEvent)
        : undefined;

      const result = this.client.wasmCore.query_likes_feed(
        currentSystemBytes,
        limit,
        latestEventBytes,
      );

      return {
        events: Events.fromBinary(result),
        errors: [],
      };
    });
  }

  queryCommentsFeed(moderationFilters?: ModerationFilters): FeedQuery {
    const currentSystem = this.client.currentIdentity.keyPair.publicKey;
    const currentSystemBytes = PublicKey.toBinary(currentSystem);

    const getQueryReferencesCallback =
      this.client.httpClient.getQueryReferences.bind(this.client.httpClient);

    const filters = moderationFilters
      ? JSON.stringify(moderationFilters)
      : null;

    const feedState: CommentsFeedState = {};

    return new FeedQuery(this.client, async (_cursors, _latestEvent) => {
      const result = await this.client.wasmCore.query_comments_feed(
        currentSystemBytes,
        getQueryReferencesCallback,
        feedState,
        filters,
      );

      return {
        events: Events.fromBinary(result.result),
        errors: result.errors,
      };
    });
  }

  queryCurrentOpinion(targetPointer: Pointer): LWWElement | null {
    const currentSystem = this.client.currentIdentity.keyPair.publicKey;
    const currentSystemBytes = PublicKey.toBinary(currentSystem);
    const targetPointerBytes = Pointer.toBinary(targetPointer);

    const result = this.client.wasmCore.query_opinion(
      currentSystemBytes,
      targetPointerBytes,
    );

    if (!result) return null;

    return LWWElement.fromBinary(result);
  }

  queryIsDeleted(targetPointer: Pointer): boolean {
    return this.client.wasmCore.query_event_is_deleted(
      Pointer.toBinary(targetPointer),
    );
  }

  queryFeed(
    system: PublicKey,
    options: {
      startTime?: bigint;
      endTime?: bigint;
      limit?: number;
      cursor?: Uint8Array;
    } = {},
  ): FeedResult {
    const systemBytes = PublicKey.toBinary(system);
    const { startTime, endTime, limit, cursor } = options;

    const result = this.client.wasmCore.query_feed_with_cursor(
      systemBytes,
      startTime,
      endTime,
      limit,
      cursor,
    );

    if (!result) {
      return FeedResult.create({
        events: [],
        cursor: new Uint8Array(),
      });
    }

    return FeedResult.fromBinary(result);
  }

  async queryUsername(system: PublicKey): Promise<string | null> {
    const lwwElement = await this._querySystemCRDT(
      ContentType.USERNAME,
      system,
    );
    if (!lwwElement) return null;
    return new TextDecoder().decode(lwwElement.value);
  }

  async queryDescription(system: PublicKey): Promise<string | null> {
    const lwwElement = await this._querySystemCRDT(
      ContentType.DESCRIPTION,
      system,
    );
    if (!lwwElement) return null;
    return new TextDecoder().decode(lwwElement.value);
  }

  async queryAvatar(system: PublicKey): Promise<ImageManifest | null> {
    const lwwElement = await this._querySystemCRDT(ContentType.AVATAR, system);
    if (!lwwElement) return null;
    return ImageManifest.fromBinary(lwwElement.value);
  }

  async queryBanner(system: PublicKey): Promise<ImageManifest | null> {
    const lwwElement = await this._querySystemCRDT(ContentType.BANNER, system);
    if (!lwwElement) return null;
    return ImageManifest.fromBinary(lwwElement.value);
  }

  queryFollows(system: PublicKey): PublicKey[] {
    const systemBytes = PublicKey.toBinary(system);
    const result = this.client.wasmCore.query_follows_for_system(systemBytes);

    if (!result) return [];

    const events = Events.fromBinary(result);
    return events.events
      .map((signedEvent) => {
        const event = ProtobufEvent.fromBinary(signedEvent.event);
        if (!event.lwwElementSet) return undefined;
        return PublicKey.fromBinary(event.lwwElementSet.value);
      })
      .filter(Boolean) as PublicKey[];
  }

  queryBlocks(system: PublicKey): PublicKey[] {
    const systemBytes = PublicKey.toBinary(system);
    const result = this.client.wasmCore.query_blocks_for_system(systemBytes);

    if (!result) return [];

    const events = Events.fromBinary(result);
    return events.events
      .map((signedEvent) => {
        const event = ProtobufEvent.fromBinary(signedEvent.event);
        if (!event.lwwElementSet) return undefined;
        return PublicKey.fromBinary(event.lwwElementSet.value);
      })
      .filter(Boolean) as PublicKey[];
  }

  queryServers(system: PublicKey): string[] {
    const systemBytes = PublicKey.toBinary(system);
    const result = this.client.wasmCore.query_servers_for_system(systemBytes);

    if (!result) return [];

    const events = Events.fromBinary(result);
    return events.events
      .map((signedEvent) => {
        const event = ProtobufEvent.fromBinary(signedEvent.event);
        if (!event.lwwElementSet) return undefined;
        return new TextDecoder().decode(event.lwwElementSet.value);
      })
      .filter(Boolean) as string[];
  }

  queryAuthorities(system: PublicKey): string[] {
    const systemBytes = PublicKey.toBinary(system);
    const result =
      this.client.wasmCore.query_authorities_for_system(systemBytes);

    if (!result) return [];

    const events = Events.fromBinary(result);
    return events.events
      .map((signedEvent) => {
        const event = ProtobufEvent.fromBinary(signedEvent.event);
        if (!event.lwwElementSet) return undefined;
        return new TextDecoder().decode(event.lwwElementSet.value);
      })
      .filter(Boolean) as string[];
  }

  queryTopics(system: PublicKey): string[] {
    const systemBytes = PublicKey.toBinary(system);
    const result = this.client.wasmCore.query_topics_for_system(systemBytes);

    if (!result) return [];

    const events = Events.fromBinary(result);
    return events.events
      .map((signedEvent) => {
        const event = ProtobufEvent.fromBinary(signedEvent.event);
        if (!event.lwwElementSet) return undefined;
        return new TextDecoder().decode(event.lwwElementSet.value);
      })
      .filter(Boolean) as string[];
  }

  private async _querySystemCRDT(
    contentType: ContentType,
    system: PublicKey,
  ): Promise<LWWElement | null> {
    const currentSystem = this.client.currentIdentity.keyPair.publicKey;
    const currentSystemBytes = PublicKey.toBinary(currentSystem);

    const systemBytes = PublicKey.toBinary(system);
    const result = await this.client.wasmCore.query_crdt_for_system(
      systemBytes,
      BigInt(contentType),
      currentSystemBytes,
      this.client.httpClient.getQueryLatest.bind(this.client.httpClient),
    );

    if (!result) return null;

    return LWWElement.fromBinary(result);
  }

  eventPointer(event: ProtobufEvent): Pointer {
    const eventBytes = ProtobufEvent.toBinary(event);
    const pointerBytes = this.client.wasmCore.get_pointer(eventBytes);
    return Pointer.fromBinary(pointerBytes);
  }

  eventKey(event: ProtobufEvent): EventKey {
    const pointer = Pointer.toBinary(this.eventPointer(event));
    const eventKeyBytes = this.client.wasmCore.get_reference(pointer);

    if (!eventKeyBytes) throw new TypeError('Event is missing required fields');

    return EventKey.fromBinary(eventKeyBytes);
  }
}
