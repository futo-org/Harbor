import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

// Codegen does not support Uint8Array so we use Object here instead
// native layer expects Uint8Array and does validation
export interface Spec extends TurboModule {
  initializeCore(): Object;
  isInitialized(): Object;
  createEvent(eventCreationData: Object, unixMs: number): Object;
  ingestEvent(signedEvent: Object): Object;
  syncEventsForSystem(system: Object, networkRequests: Object): Object;
  queryExploreFeed(
    system: Object,
    networkRequests: Object,
    feedQuery: Object,
    cursor: Object
  ): Object;
  querySearchFeed(
    system: Object,
    networkRequests: Object,
    feedQuery: Object,
    searchQuery: Object,
    cursor: Object
  ): Object;
  queryAuthorFeed(
    system: Object,
    author: Object,
    networkRequests: Object,
    limit: number,
    latestEvent: Object
  ): Object;
  queryReferencesFeed(
    system: Object,
    networkRequests: Object,
    feedQuery: Object,
    reference: Object,
    cursor: Object
  ): Object;
  queryCrdtForSystem(
    targetSystem: Object,
    contentType: number,
    currentSystem: Object,
    networkRequests: Object
  ): Object;
  queryCommentsFeed(
    system: Object,
    networkRequests: Object,
    feedQuery: Object,
    cursor: Object
  ): Object;
  queryFollowingFeed(
    system: Object,
    limit: number,
    latestEvent: Object
  ): Object;
  queryLikesFeed(system: Object, limit: number, latestEvent: Object): Object;
  queryOpinion(currentSystem: Object, targetPointer: Object): Object;
  queryEventIsDeleted(pointer: Object): Object;
  queryFollowsForSystem(system: Object): Object;
  queryBlocksForSystem(system: Object): Object;
  queryServersForSystem(system: Object): Object;
  queryAuthoritiesForSystem(system: Object): Object;
  queryTopicsForSystem(system: Object): Object;
  queryFeedWithCursor(feedQuery: Object): Object;
  queryEvents(
    system: Object,
    process: Object,
    startClock: number,
    endClock: number
  ): Object;
  getPointer(eventBytes: Object): Object;
  getReference(pointerBytes: Object): Object;
}

export default TurboModuleRegistry.getEnforcing<Spec>('PolycentricCore');
