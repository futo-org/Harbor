import 'fast-text-encoding';

// Re-export the ubrn web init as `uniffiInitAsync` — consumers must
// `await` it before constructing a client (it loads + initializes the
// wasm module).
export {
  uniffiInitAsync,
  EmitMode,
  FeedSort,
  FetchMode,
  isModerationLabel,
  labelsChanged,
  labelsFromFeedResponse,
  labelsFromNotificationsResponse,
  labelsFromSearchResponse,
  labelsFromThreadResponse,
  moderationLabels,
  PolycentricCore,
  Query,
  QueryStatus,
  SearchPostsSort,
  SearchUsersSort,
  UpdateMode,
} from '@polycentric/rs-core-wasm/web';
export type {
  EventKey,
  QueryResultFfi,
  QueryOpts,
  LabelSet,
  PostLabel,
} from '@polycentric/rs-core-wasm/web';

export * from '@polycentric/js-core';
export * as types from '@polycentric/js-core';

export {
  createPolycentricClient,
  createIdentity,
} from './create-polycentric-client.web';
export type { CreatePolycentricClientConfig } from './create-polycentric-client.shared';
