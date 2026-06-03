pub mod dedup;
pub mod key;

use std::collections::HashSet;
use std::sync::Arc;

use polycentric_common::models::protos_v2::{
    EventBundle, ListEventsFilters, ListEventsRequest, ListEventsResponse,
    event_sync_service_client::EventSyncServiceClient,
};
use prost::Message;

use crate::query::event::dedup::{EventDedupKey, event_dedup_key};
use crate::query::event::key::PublicKey;
use crate::query::validation::{retain_validated_bundles, retain_validated_hints};
use crate::query::{
    QueryClient, QueryKey, QueryObservable, QueryOpts, QueryResult, QueryStatus, channel,
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

fn merge_list_events_responses(
    values: &[Vec<u8>],
    client: &std::sync::Arc<std::sync::Mutex<crate::client::PolycentricClient>>,
) -> Vec<u8> {
    let mut merged = ListEventsResponse::default();
    for v in values {
        if let Ok(incoming) = ListEventsResponse::decode(v.as_slice()) {
            merged.event_bundles.extend(incoming.event_bundles);
            merged.event_hints.extend(incoming.event_hints);
        }
    }

    let mut seen_bundles: HashSet<EventDedupKey> = HashSet::new();
    merged
        .event_bundles
        .retain(|bundle| match event_dedup_key(bundle) {
            Some(k) => seen_bundles.insert(k),
            None => true,
        });
    let mut seen_hints: HashSet<EventDedupKey> = HashSet::new();
    merged.event_hints.retain(
        |hint| match hint.event_bundle.as_ref().and_then(event_dedup_key) {
            Some(k) => seen_hints.insert(k),
            None => true,
        },
    );

    let c = client.lock().unwrap();
    retain_validated_bundles(&c, &mut merged.event_bundles);
    retain_validated_hints(&c, &mut merged.event_hints);
    drop(c);

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

    let client = query_client.client().clone();
    let query_fn = move |server_url: String| {
        let request = request.clone();
        let client = client.clone();
        async move {
            let response = EventSyncServiceClient::new(channel(&server_url)?)
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
                let mut c = client.lock().unwrap();
                c.copy_bundles(hint_bundles);
                c.copy_bundles(response.event_bundles);
            }
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, merge_list_events_responses, opts))
}

/// Merge function for `get_event`. Each per-server slot stores the
/// bytes of a single `EventBundle` (or empty when that server had
/// nothing). Picks the first non-empty value whose bundle validates;
/// returns empty bytes if none do.
fn merge_event(
    values: &[Vec<u8>],
    client: &std::sync::Arc<std::sync::Mutex<crate::client::PolycentricClient>>,
) -> Vec<u8> {
    let c = client.lock().unwrap();
    for v in values {
        if v.is_empty() {
            continue;
        }
        let Ok(bundle) = EventBundle::decode(v.as_slice()) else {
            continue;
        };
        let Some(signed) = bundle.signed_event.as_ref() else {
            continue;
        };
        match c.validate_event(signed, &bundle.event_proofs) {
            Ok(()) => return v.clone(),
            Err(e) => {
                crate::logging::log_msg(format!("[merge_event] dropping bundle: {e:?}"));
            }
        }
    }
    Vec::new()
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

    if let Some(bundle) = query_client
        .client()
        .lock()
        .unwrap()
        .find_event_bundle_by_sequence(&identity, collection, sequence)
    {
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
            let response = EventSyncServiceClient::new(channel(&server_url)?)
                .list_events(request)
                .await
                .map_err(|e| format!("get_event [{server_url}]: {e}"))?
                .into_inner();
            let bytes = response
                .event_bundles
                .first()
                .map(EventBundle::encode_to_vec)
                .unwrap_or_default();
            let hint_bundles: Vec<_> = response
                .event_hints
                .into_iter()
                .filter_map(|h| h.event_bundle)
                .collect();
            {
                let mut c = client.lock().unwrap();
                c.copy_bundles(hint_bundles);
                c.copy_bundles(response.event_bundles);
            }
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, merge_event, opts))
}
