pub mod dedup;
pub mod key;

use std::collections::HashSet;
use std::sync::Arc;

use polycentric_common::models::protos_v2::{
    event_sync_service_client::EventSyncServiceClient, EventBundle, ListEventsFilters,
    ListEventsRequest, ListEventsResponse,
};
use prost::Message;

use crate::query::event::dedup::{event_dedup_key, EventDedupKey};
use crate::query::event::key::PublicKey;
use crate::query::{
    channel, QueryClient, QueryKey, QueryObservable, QueryOpts, QueryResult, QueryStatus,
};
use crate::rx::observable::Observable;

#[derive(Clone, Debug, uniffi::Record)]
pub struct ListEventsArgs {
    pub size: Option<i32>,
    pub identity: Option<String>,
    pub collection: Option<i32>,
    pub signed_by: Option<PublicKey>,
    pub sequence_gt: Option<i64>,
    pub sequence_lt: Option<i64>,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetEventArgs {
    pub identity: String,
    pub collection: i32,
    pub sequence: u64,
}

fn merge_list_events_responses(values: &[Vec<u8>]) -> Vec<u8> {
    let mut merged = ListEventsResponse::default();
    for v in values {
        if let Ok(incoming) = ListEventsResponse::decode(v.as_slice()) {
            merged.event_bundles.extend(incoming.event_bundles);
        }
    }

    let mut seen: HashSet<EventDedupKey> = HashSet::new();
    merged
        .event_bundles
        .retain(|bundle| match event_dedup_key(bundle) {
            Some(k) => seen.insert(k),
            None => true,
        });

    merged.encode_to_vec()
}

/// Returns serialized `ListEventsResponse` proto bytes on each emission with
/// `event_bundles` deduped by `EventKey`.
pub fn list_events(
    query_client: &QueryClient<Vec<u8>>,
    query_key: QueryKey,
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
    } = args;
    let fetch_mode = opts.as_ref().and_then(|o| o.fetch_mode);
    crate::logging::log_msg(format!(
        "[list_events] called identity={identity:?} collection={collection:?} size={size:?} fetch_mode={fetch_mode:?}"
    ));

    let request = ListEventsRequest {
        filters: Some(ListEventsFilters {
            collection,
            identity,
            signed_by: signed_by.map(Into::into),
            sequence_gt,
            sequence_lt,
        }),
        size,
    };

    let query_fn = move |server_url: String| {
        let request = request.clone();
        async move {
            crate::logging::log_msg(format!("[list_events] fetching from server={server_url}"));
            let response = EventSyncServiceClient::new(channel(&server_url)?)
                .list_events(request)
                .await
                .map_err(|e| format!("list_events [{server_url}]: {e}"))?
                .into_inner();
            crate::logging::log_msg(format!(
                "[list_events] received {n} bundles from server={server_url}",
                n = response.event_bundles.len()
            ));
            Ok(response.encode_to_vec())
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, merge_list_events_responses, opts))
}

/// Merge function for `get_event`. Each per-server slot stores the
/// bytes of a single `EventBundle` (or empty when that server had
/// nothing). Picks the first non-empty value.
fn merge_event(values: &[Vec<u8>]) -> Vec<u8> {
    values
        .iter()
        .find(|v| !v.is_empty())
        .cloned()
        .unwrap_or_default()
}

/// Return a single event based on its key (or partial key)
pub fn get_event(
    query_client: &QueryClient<Vec<u8>>,
    query_key: QueryKey,
    args: GetEventArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetEventArgs {
        identity,
        collection,
        sequence,
    } = args;
    let fetch_mode = opts.as_ref().and_then(|o| o.fetch_mode);
    crate::logging::log_msg(format!(
        "[get_event] called identity={identity} collection={collection} sequence={sequence} fetch_mode={fetch_mode:?}"
    ));

    if let Some(bundle) = query_client
        .client()
        .lock()
        .unwrap()
        .find_event_bundle_by_sequence(&identity, collection, sequence)
    {
        crate::logging::log_msg(format!(
            "[get_event] local-store hit identity={identity} sequence={sequence}"
        ));
        let bytes = bundle.encode_to_vec();
        let observable: Observable<QueryResult<Vec<u8>>> = Observable::new(move |subscriber| {
            subscriber.next(QueryResult {
                data: Some(bytes.clone()),
                status: QueryStatus::Success,
            });
            subscriber.complete();
        });
        return Arc::new(observable);
    }

    let sequence_i64 = sequence as i64;
    let request = ListEventsRequest {
        filters: Some(ListEventsFilters {
            collection: Some(collection),
            identity: Some(identity),
            signed_by: None,
            sequence_gt: Some(sequence_i64.saturating_sub(1)),
            sequence_lt: Some(sequence_i64.saturating_add(1)),
        }),
        size: Some(1),
    };

    let client = query_client.client().clone();

    let query_fn = move |server_url: String| {
        let request = request.clone();
        let client = client.clone();
        async move {
            crate::logging::log_msg(format!("[get_event] fetching from server={server_url}"));
            let response = EventSyncServiceClient::new(channel(&server_url)?)
                .list_events(request)
                .await
                .map_err(|e| format!("get_event [{server_url}]: {e}"))?
                .into_inner();
            let bundles = response.event_bundles;
            let bytes = bundles
                .first()
                .map(EventBundle::encode_to_vec)
                .unwrap_or_default();
            client.lock().unwrap().copy_bundles(bundles);
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, merge_event, opts))
}
