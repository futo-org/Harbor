//! Event-related primitives:
//! - `dedup` — `EventBundle` deduplication helper used by every merge
//!   function.
//! - `key` — FFI-friendly mirrors of the proto `EventKey` /
//!   `PublicKey` messages.
//! - `list_events` — `EventSyncService.ListEvents` surfaced as an
//!   observable via `Query`.

pub mod dedup;
pub mod key;

use std::collections::HashSet;
use std::sync::Arc;

use polycentric_common::models::protos_v2::{
    event_sync_service_client::EventSyncServiceClient, EventBundle, ListEventsFilters,
    ListEventsRequest, ListEventsResponse,
};
use prost::Message;

use crate::event::dedup::{event_dedup_key, EventDedupKey};
use crate::event::key::PublicKey;
use crate::query::{FetchMode, Query, QueryObservable, QueryResult, QueryStatus};
use crate::rx::observable::Observable;
use crate::transport::channel;

fn merge_list_events_responses(prev: Option<Vec<u8>>, new: Vec<u8>) -> Vec<u8> {
    let mut merged = prev
        .as_deref()
        .and_then(|b| ListEventsResponse::decode(b).ok())
        .unwrap_or_default();
    if let Ok(incoming) = ListEventsResponse::decode(new.as_slice()) {
        merged.event_bundles.extend(incoming.event_bundles);
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

/// Fan out `ListEvents` to every configured server. Returns serialized
/// `ListEventsResponse` proto bytes on each emission with
/// `event_bundles` deduped by `EventKey`.
#[allow(clippy::too_many_arguments)]
pub fn list_events(
    query: &Query<Vec<u8>>,
    size: Option<i32>,
    identity: Option<String>,
    collection: Option<i32>,
    signed_by: Option<PublicKey>,
    sequence_gt: Option<i64>,
    sequence_lt: Option<i64>,
    fetch_mode: Option<FetchMode>,
) -> Arc<dyn QueryObservable> {
    crate::logging::log_msg(format!(
        "[list_events] called identity={identity:?} collection={collection:?} size={size:?} fetch_mode={fetch_mode:?}"
    ));

    let cache_key = format!(
        "list_events:size={size:?}:identity={identity:?}:collection={collection:?}:signed_by={:?}:gt={sequence_gt:?}:lt={sequence_lt:?}",
        signed_by.as_ref().map(|k| (k.key_type, k.key.clone())),
    );

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

    Arc::new(query.query(
        cache_key,
        query_fn,
        Some(merge_list_events_responses),
        fetch_mode,
    ))
}

/// Merge function for `get_event`. Each emission is the bytes of a
/// single `EventBundle` (or empty when the server returned nothing).
/// Prefer the most recent non-empty value.
fn merge_event(prev: Option<Vec<u8>>, new: Vec<u8>) -> Vec<u8> {
    if new.is_empty() {
        prev.unwrap_or_default()
    } else {
        new
    }
}

/// Fetch a single event by (identity, collection, sequence). Checks
/// the local store first — if a bundle matching that sequence is
/// present, emits it and completes without touching the network.
/// Otherwise fans out a `ListEvents` query pinned to this exact
/// sequence (`sequence_gt = seq - 1`, `sequence_lt = seq + 1`),
/// persists what it finds, and emits the first matching bundle as
/// serialized `EventBundle` proto bytes.
pub fn get_event(
    query: &Query<Vec<u8>>,
    identity: String,
    collection: i32,
    sequence: u64,
    fetch_mode: Option<FetchMode>,
) -> Arc<dyn QueryObservable> {
    crate::logging::log_msg(format!(
        "[get_event] called identity={identity} collection={collection} sequence={sequence} fetch_mode={fetch_mode:?}"
    ));

    if let Some(bundle) = query
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

    let cache_key = format!("event:{collection}:{identity}:{sequence}");

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

    let client = query.client().clone();

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

    Arc::new(query.query(cache_key, query_fn, Some(merge_event), fetch_mode))
}
