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
  labelsFromGetPostResponse,
  labelsFromGetProfileResponse,
  labelsFromVerificationClaimsResponse,
  labelsFromTargetedVerificationClaimsResponse,
  labelsFromGetVerificationClaimResponse,
  moderationLabels,
  PolycentricCore,
  Query,
  QueryStatus,
  SearchPostsSort,
  SearchUsersSort,
  UpdateMode,
} from '@polycentric/js-wasm/web';
export type {
  EventKey,
  QueryResultFfi,
  QueryOpts,
  LabelSet,
  PostLabel,
} from '@polycentric/js-wasm/web';

export * from '@polycentric/js-sdk';
export * as types from '@polycentric/js-sdk';

export {
  createPolycentricClient,
  createIdentity,
} from './create-polycentric-client.web';
export type { CreatePolycentricClientConfig } from './create-polycentric-client.shared';
