import { Events, RangesForSystem } from '../proto/polycentric';
import { RequestManager } from './request-manager';
import { Defaults } from '../constants';
import { Base64 } from 'js-base64';

export interface HTTPClientConfig {
  userAgent?: string;
  timeout?: number;
  retries?: number;
  verifierServer?: string;
  verifierAssociatedServers?: string[];
  debug?: boolean;
}

const DEFAULT_CONFIG: Required<HTTPClientConfig> = {
  userAgent: Defaults.USER_AGENT,
  timeout: 30000,
  retries: 3,
  verifierServer: Defaults.VERIFIER_SERVER,
  verifierAssociatedServers: [...Defaults.VERIFIER_ASSOCIATED_SERVERS],
  debug: false,
};

function encodeBase64(data: Uint8Array): string {
  return Base64.fromUint8Array(data, true);
}

export class HTTPClient {
  private config: Required<HTTPClientConfig>;
  private requestManager: RequestManager;

  constructor(config: HTTPClientConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.requestManager = new RequestManager(
      this.config.userAgent,
      this.config.timeout,
      this.config.retries,
    );
  }

  /*
   * Sync callbacks
   */

  async postEvents(server: string, events: Uint8Array): Promise<void> {
    await this.requestManager.makeRequest(`${server}/events`, {
      method: 'POST',
      body: events.slice(),
    });
  }

  async getEvents(
    server: string,
    system: Uint8Array,
    ranges: Uint8Array,
  ): Promise<Uint8Array> {
    const systemQuery = encodeBase64(system);
    const rangesQuery = encodeBase64(ranges);

    const url = `${server}/events?system=${systemQuery}&ranges=${rangesQuery}`;

    const response = await this.requestManager.makeRequest(url);
    return response.ok
      ? new Uint8Array(await response.arrayBuffer())
      : Events.toBinary({ events: [] });
  }

  async getRanges(server: string, system: Uint8Array): Promise<Uint8Array> {
    const systemQuery = encodeBase64(system);
    const response = await this.requestManager.makeRequest(
      `${server}/ranges?system=${systemQuery}`,
    );
    return response.ok
      ? new Uint8Array(await response.arrayBuffer())
      : RangesForSystem.toBinary({ rangesForProcesses: [] });
  }

  async getHead(server: string, system: Uint8Array): Promise<Uint8Array> {
    const systemQuery = encodeBase64(system);
    const response = await this.requestManager.makeRequest(
      `${server}/head?system=${systemQuery}`,
    );
    return response.ok
      ? new Uint8Array(await response.arrayBuffer())
      : Events.toBinary({ events: [] });
  }

  async getExplore(
    server: string,
    cursor?: Uint8Array,
    limit?: number,
    moderationFilters?: string,
  ): Promise<Uint8Array> {
    const url = new URL(server);
    url.pathname = 'explore';

    if (cursor) {
      url.searchParams.append('cursor', encodeBase64(cursor));
    }
    if (limit) {
      url.searchParams.append('limit', limit.toString());
    }
    if (moderationFilters) {
      url.searchParams.append('moderation_filters', moderationFilters);
    }

    const response = await this.requestManager.makeRequest(url.toString());

    if (!response.ok) {
      // Proper error handling
      // TODO replicate this across other HTTP methods and handle errors in the rust core instead
      throw new Error('Server did not respond with OK');
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  async getSearch(
    server: string,
    searchQuery?: string,
    searchType?: string,
    cursor?: Uint8Array,
    limit?: number,
    moderationFilters?: string,
  ): Promise<Uint8Array> {
    const url = new URL(server);
    url.pathname = 'search';

    if (searchQuery) {
      url.searchParams.append('search', searchQuery);
    }
    if (searchType) {
      url.searchParams.append('search_type', searchType);
    }
    if (cursor) {
      url.searchParams.append('cursor', encodeBase64(cursor));
    }
    if (limit) {
      url.searchParams.append('limit', limit.toString());
    }
    if (moderationFilters) {
      url.searchParams.append('moderation_filters', moderationFilters);
    }

    const response = await this.requestManager.makeRequest(url.toString());

    if (!response.ok) {
      // Proper error handling
      // TODO replicate this across other HTTP methods and handle errors in the rust core instead
      throw new Error('Server did not respond with OK');
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  async getQueryLatest(
    server: string,
    system: Uint8Array,
    eventTypes: Uint8Array,
  ): Promise<Uint8Array> {
    const url = new URL(server);
    url.pathname = 'query_latest';

    if (system) {
      url.searchParams.append('system', encodeBase64(system));
    }
    if (eventTypes) {
      url.searchParams.append('event_types', encodeBase64(eventTypes));
    }

    const response = await this.requestManager.makeRequest(url.toString());

    if (!response.ok) {
      // Proper error handling
      // TODO replicate this across other HTTP methods and handle errors in the rust core instead
      throw new Error('Server did not respond with OK');
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  async getQueryReferences(
    server: string,
    request: Uint8Array,
    moderationFilters?: string,
  ): Promise<Uint8Array> {
    const url = new URL(server);
    url.pathname = 'query_references';

    url.searchParams.append('query', encodeBase64(request));

    if (moderationFilters) {
      url.searchParams.append('moderation_filters', moderationFilters);
    }

    const response = await this.requestManager.makeRequest(url.toString());

    if (!response.ok) {
      // Proper error handling
      // TODO replicate this across other HTTP methods and handle errors in the rust core instead
      throw new Error('Server did not respond with OK');
    }

    return new Uint8Array(await response.arrayBuffer());
  }
}
