pub mod key;
pub mod labels;
pub mod merge;

use std::sync::{Arc, Mutex};

use polycentric_common::models::protos_v2::feeds_service_client::FeedsServiceClient;
use polycentric_common::models::protos_v2::{
    EventBundle, EventHint, GetPostRequest, GetPostResponse, ListEventsFilters, ListEventsRequest,
    ListEventsResponse, event_sync_service_client::EventSyncServiceClient,
};
use polycentric_common::models::{collections, protos_v2};
use prost::Message;

use crate::client::PolycentricClient;
use crate::lock::LockRecover;
use crate::query::blocks::retain_unblocked_bundles;
use crate::query::event::key::{EventKey, PublicKey};
use crate::query::event::merge::{
    EventBundleResponse, decode_event, merge_bundle_response, merge_bundle_responses,
};
use crate::query::validation::retain_validated_hints;
use crate::query::{
    QueryClient, QueryKey, QueryObservable, QueryOpts, QueryResult, QueryStatus, channel,
};
use crate::rx::observable::Observable;
use crate::store::keys::EventKey as StoreEventKey;

#[derive(Clone, Debug, uniffi::Record)]
pub struct ListEventsArgs {
    pub size: Option<i32>,
    pub identity: Option<String>,
    pub collection: Option<i32>,
    pub signed_by: Option<PublicKey>,
    pub sequence_gt: Option<i64>,
    pub sequence_lt: Option<i64>,
    pub heads: Option<Vec<EventKey>>,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetEventArgs {
    pub identity: String,
    pub collection: i32,
    pub sequence: u64,
    pub signer_key_prefix: Option<String>,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetPostArgs {
    pub identity: String,
    pub sequence: u64,
    pub signer_key_prefix: Option<String>,
}

impl EventBundleResponse for GetPostResponse {
    fn bundles_mut(&mut self) -> &mut Vec<EventBundle> {
        &mut self.candidates
    }
    fn hints_mut(&mut self) -> &mut Vec<EventHint> {
        &mut self.event_hints
    }
}

impl EventBundleResponse for ListEventsResponse {
    fn bundles_mut(&mut self) -> &mut Vec<EventBundle> {
        &mut self.event_bundles
    }
    fn hints_mut(&mut self) -> &mut Vec<EventHint> {
        &mut self.event_hints
    }
}

/// Returns serialized `ListEventsResponse` proto bytes on each emission with
/// `event_bundles` deduped by `EventKey`.
pub fn list_events(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: ListEventsArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let ListEventsArgs {
        size,
        identity,
        collection,
        signed_by,
        sequence_gt,
        sequence_lt,
        heads,
    } = args;

    let heads = heads
        .unwrap_or_default()
        .into_iter()
        .map(
            |EventKey {
                 collection,
                 identity,
                 signed_by,
                 sequence,
             }| {
                let PublicKey { key_type, key } = signed_by;
                protos_v2::EventKey {
                    collection,
                    identity,
                    signed_by: Some(protos_v2::PublicKey { key_type, key }),
                    sequence,
                }
            },
        )
        .collect();

    let request = ListEventsRequest {
        filters: Some(ListEventsFilters {
            collection,
            identity,
            signed_by: signed_by.map(Into::into),
            sequence_gt,
            sequence_lt,
            heads,
        }),
        size,
    };

    let client = query_client.client().clone();
    let query_fn = move |server_url: String| {
        let request = request.clone();
        let client = client.clone();
        async move {
            let response = EventSyncServiceClient::new(channel(&server_url).await?)
                .list_events(request)
                .await
                .map_err(|e| format!("list_events [{server_url}]: {e}"))?
                .into_inner();
            let bytes = response.encode_to_vec();
            let hint_bundles: Vec<_> = response
                .event_hints
                .into_iter()
                .filter_map(|h| h.event_bundle)
                .collect();
            {
                let mut c = client.lock_recover();
                c.copy_bundles(hint_bundles);
                c.copy_bundles(response.event_bundles);
            }
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(
        query_key,
        query_fn,
        merge_bundle_responses::<ListEventsResponse>,
        opts,
    ))
}

/// Return a single event based on its key (or partial key)
pub fn get_event(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: GetEventArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetEventArgs {
        identity,
        collection,
        sequence,
        signer_key_prefix,
    } = args;
    let signer_key_prefix = Arc::new(signer_key_prefix);

    if let Some(bundle) = query_client
        .client()
        .lock_recover()
        .find_event_bundle_by_sequence(
            &identity,
            collection,
            sequence,
            signer_key_prefix.as_deref(),
        )
    {
        let bytes = bundle.encode_to_vec();
        let observable: Observable<QueryResult<Vec<u8>>> = Observable::new(move |subscriber| {
            subscriber.next(QueryResult {
                data: Some(bytes.clone()),
                status: QueryStatus::Success,
                successful_servers: 0,
                pending_servers: 0,
            });
            subscriber.complete();
        });
        return Arc::new(observable);
    }

    let sequence_i64 = sequence as i64;
    let request = ListEventsRequest {
        filters: Some(ListEventsFilters {
            collection: Some(collection),
            identity: Some(identity.clone()),
            signed_by: None,
            sequence_gt: Some(sequence_i64.saturating_sub(1)),
            sequence_lt: Some(sequence_i64.saturating_add(1)),
            heads: vec![],
        }),
        size: None,
    };

    let client = query_client.client().clone();

    // The query function will copy event bundles and hints into the local store,
    // so we can rely on the local store to handle tombstones properly.
    let merge_fn = {
        let identity = identity.clone();
        let signer_key_prefix = signer_key_prefix.clone();

        move |_values: &[Vec<u8>],
              _previous: Option<&Vec<u8>>,
              client: &Arc<Mutex<PolycentricClient>>| {
            let bundle = client.clone().lock_recover().find_event_bundle_by_sequence(
                &identity,
                collection,
                sequence,
                signer_key_prefix.as_deref(),
            );

            bundle
                .as_ref()
                .map(EventBundle::encode_to_vec)
                .unwrap_or_default()
        }
    };

    let query_fn = move |server_url: String| {
        let request = request.clone();
        let identity = identity.clone();
        let client = client.clone();
        let signer_key_prefix = signer_key_prefix.clone();

        async move {
            let response = EventSyncServiceClient::new(channel(&server_url).await?)
                .list_events(request)
                .await
                .map_err(|e| format!("get_event [{server_url}]: {e}"))?
                .into_inner();

            let hint_bundles: Vec<_> = response
                .event_hints
                .into_iter()
                .filter_map(|h| h.event_bundle)
                .collect();

            // Copy events and content to local stores so that we can rely on
            // the client to handle tombstone checking logic
            let bundle = {
                let mut c = client.lock_recover();
                c.copy_bundles(hint_bundles);
                c.copy_bundles(response.event_bundles);
                c.find_event_bundle_by_sequence(
                    &identity,
                    collection,
                    sequence,
                    signer_key_prefix.as_deref(),
                )
            };

            let bytes = bundle
                .as_ref()
                .map(EventBundle::encode_to_vec)
                .unwrap_or_default();

            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, merge_fn, opts))
}

/// Return event bundles using the local in-memory stores matching the filters.
fn get_events_from_stores(
    client: &Arc<Mutex<PolycentricClient>>,
    identity: &str,
    collection: i32,
    sequence: u64,
    signer_key_prefix: Option<&str>,
) -> Vec<EventBundle> {
    let c = client.lock_recover();

    // TODO: return multiple candidates to callers.
    // There should almost never be multiple when a signer key prefix is provided,
    // but we should still handle the case where one isn't.
    let mut candidates: Vec<EventBundle> = c
        .find_event_bundle_by_sequence(identity, collection, sequence, signer_key_prefix)
        .into_iter()
        .collect();

    retain_unblocked_bundles(&c.blocked_identities(), &mut candidates);
    candidates
}

/// Return the candidate posts matching a partial event key along with the hints
/// that the servers shipped with them.
/// Emits serialized `GetPostResponse` proto bytes.
pub fn get_post(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: GetPostArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetPostArgs {
        identity,
        sequence,
        signer_key_prefix,
    } = args;
    let signer_key_prefix = Arc::new(signer_key_prefix);

    let candidates = get_events_from_stores(
        query_client.client(),
        &identity,
        collections::FEED,
        sequence,
        signer_key_prefix.as_deref(),
    );

    if !candidates.is_empty() {
        let event_hints = {
            let client = query_client.client().lock_recover();

            let mut hints: Vec<EventHint> = candidates
                .iter()
                .filter_map(decode_event)
                .filter_map(|event| StoreEventKey::from_event(event).ok())
                .flat_map(|target| client.label_bundles_for(&target))
                .map(|bundle| EventHint {
                    event_bundle: Some(bundle),
                })
                .collect();

            retain_validated_hints(&client, &mut hints);
            hints
        };

        let bytes = GetPostResponse {
            candidates,
            event_hints,
        }
        .encode_to_vec();

        let observable: Observable<QueryResult<Vec<u8>>> = Observable::new(move |subscriber| {
            subscriber.next(QueryResult {
                data: Some(bytes.clone()),
                status: QueryStatus::Success,
                successful_servers: 0,
                pending_servers: 0,
            });
            subscriber.complete();
        });
        return Arc::new(observable);
    }

    let request = GetPostRequest {
        identity: identity.clone(),
        sequence,
        omit_labels: vec![],
    };

    let client = query_client.client().clone();

    let merge_fn = {
        let identity = identity.clone();
        let signer_key_prefix = signer_key_prefix.clone();

        move |values: &[Vec<u8>],
              _previous: Option<&Vec<u8>>,
              client: &Arc<Mutex<PolycentricClient>>| {
            let mut merged = merge_bundle_response::<GetPostResponse>(values, client);

            // Derive the final candidates from local stores so that tombstoned
            // candidates are filtered out properly.
            merged.candidates = get_events_from_stores(
                client,
                &identity,
                collections::FEED,
                sequence,
                signer_key_prefix.as_deref(),
            );

            merged.encode_to_vec()
        }
    };

    let query_fn = move |server_url: String| {
        let request = request.clone();
        let client = client.clone();

        async move {
            let response = FeedsServiceClient::new(channel(&server_url).await?)
                .get_post(request)
                .await
                .map_err(|e| format!("get_post [{server_url}]: {e}"))?
                .into_inner();

            let bytes = response.encode_to_vec();

            // Copy events and content to local stores so that the merge can
            // rely on the client for tombstone checking logic.
            let hint_bundles: Vec<_> = response
                .event_hints
                .into_iter()
                .filter_map(|h| h.event_bundle)
                .collect();

            {
                let mut c = client.lock_recover();
                c.copy_bundles(hint_bundles);
                c.copy_bundles(response.candidates);
            }

            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, merge_fn, opts))
}
