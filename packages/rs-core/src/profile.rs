use std::collections::HashSet;
use std::sync::Arc;

use polycentric_common::models::protos_v2::{
    event_sync_service_client::EventSyncServiceClient, ListEventsFilters, ListEventsRequest,
    ListEventsResponse,
};
use prost::Message;

use crate::event::dedup::{event_dedup_key, EventDedupKey};
use crate::query::{FetchMode, Query, QueryObservable, QueryResult, QueryStatus};
use crate::rx::observable::Observable;
use crate::transport::channel;

const PROFILE_COLLECTION: i32 = 3;

fn merge_profile_responses(prev: Option<Vec<u8>>, new: Vec<u8>) -> Vec<u8> {
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

/// Fetch `identity`'s `PROFILE` collection events.
pub fn get_profile(
    query: &Query<Vec<u8>>,
    identity: String,
    fetch_mode: Option<FetchMode>,
) -> Arc<dyn QueryObservable> {
    crate::logging::log_msg(format!(
        "[get_profile] called identity={identity} fetch_mode={fetch_mode:?}"
    ));

    // OfflineOnly always emits and completes (even with no local data).
    // OfflineFirst only short-circuits when something is actually there otherwise falls
    // through to the network path.
    let offline_first = matches!(fetch_mode, Some(FetchMode::OfflineFirst));
    let offline_only = matches!(fetch_mode, Some(FetchMode::OfflineOnly));
    if offline_first || offline_only {
        let local_bundles = query
            .client()
            .lock()
            .unwrap()
            .list_valid_events(&identity, PROFILE_COLLECTION)
            .unwrap_or_default();

        if offline_only || !local_bundles.is_empty() {
            crate::logging::log_msg(format!(
                "[get_profile] {mode:?} local-store emit for identity={identity} ({n} bundles)",
                mode = fetch_mode,
                n = local_bundles.len()
            ));
            let bytes = ListEventsResponse {
                event_bundles: local_bundles,
                previous_token: String::new(),
                next_token: String::new(),
            }
            .encode_to_vec();

            let observable: Observable<QueryResult<Vec<u8>>> = Observable::new(move |subscriber| {
                subscriber.next(QueryResult {
                    data: Some(bytes.clone()),
                    status: QueryStatus::Success,
                });
                subscriber.complete();
            });
            return Arc::new(observable);
        }
    }

    // Network request (or cache)

    let cache_key = format!("profile:{identity}");
    let client = query.client().clone();

    let query_fn = move |server_url: String| {
        let identity = identity.clone();
        let client = client.clone();
        async move {
            crate::logging::log_msg(format!(
                "[get_profile] fetching from server={server_url} identity={identity}"
            ));
            let response: ListEventsResponse = EventSyncServiceClient::new(channel(&server_url)?)
                .list_events(ListEventsRequest {
                    filters: Some(ListEventsFilters {
                        collection: Some(PROFILE_COLLECTION),
                        identity: Some(identity),
                        signed_by: None,
                        sequence_gt: None,
                        sequence_lt: None,
                    }),
                    size: None,
                })
                .await
                .map_err(|e| format!("get_profile list_events [{server_url}]: {e}"))?
                .into_inner();

            crate::logging::log_msg(format!(
                "[get_profile] received {n} bundles from server={server_url}",
                n = response.event_bundles.len()
            ));
            let bytes = response.encode_to_vec();
            client.lock().unwrap().copy_bundles(response.event_bundles);
            Ok(bytes)
        }
    };

    Arc::new(query.query(
        cache_key,
        query_fn,
        Some(merge_profile_responses),
        fetch_mode,
    ))
}
