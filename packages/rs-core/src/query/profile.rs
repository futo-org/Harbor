use std::collections::HashSet;
use std::sync::Arc;

use polycentric_common::models::protos_v2::{
    event_sync_service_client::EventSyncServiceClient, ListEventsFilters, ListEventsRequest,
    ListEventsResponse,
};
use prost::Message;

use crate::query::event::dedup::{event_dedup_key, EventDedupKey};
use crate::query::{
    channel, FetchMode, QueryClient, QueryKey, QueryObservable, QueryOpts, QueryResult, QueryStatus,
};
use crate::rx::observable::Observable;

const PROFILE_COLLECTION: i32 = 3;

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetProfileArgs {
    pub identity: String,
}

fn merge_profile_responses(values: &[Vec<u8>]) -> Vec<u8> {
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

/// Encode `identity`'s `PROFILE` collection events out of the local
/// event store, returning `None` when the store has nothing for this
/// identity.
fn local_profile_bytes(query_client: &QueryClient<Vec<u8>>, identity: &str) -> Option<Vec<u8>> {
    let bundles = query_client
        .client()
        .lock()
        .unwrap()
        .list_valid_events(identity, PROFILE_COLLECTION)
        .unwrap_or_default();
    if bundles.is_empty() {
        return None;
    }
    Some(
        ListEventsResponse {
            event_bundles: bundles,
            previous_token: String::new(),
            next_token: String::new(),
        }
        .encode_to_vec(),
    )
}

/// Fetch `identity`'s `PROFILE` collection events.
///
/// - `OfflineOnly`: emits whatever's in the local store (or an empty
///   response) and completes.
/// - `OfflineFirst` with local data: emits local data and completes.
/// - `OfflineFirst` with no local data: falls through to the network.
/// - `Default` (and `None`): wraps the network observable so the
///   first emission is the local store snapshot (stale-while-revalidate)
///   while the server fan-out runs in the background.
pub fn get_profile(
    query_client: &QueryClient<Vec<u8>>,
    query_key: QueryKey,
    args: GetProfileArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetProfileArgs { identity } = args;
    let fetch_mode = opts.as_ref().and_then(|o| o.fetch_mode);
    crate::logging::log_msg(format!(
        "[get_profile] called identity={identity} fetch_mode={fetch_mode:?}"
    ));

    let local_bytes = local_profile_bytes(query_client, &identity);

    let offline_only = matches!(fetch_mode, Some(FetchMode::OfflineOnly));
    let offline_first = matches!(fetch_mode, Some(FetchMode::OfflineFirst));
    let skip_network = offline_only || (offline_first && local_bytes.is_some());
    if skip_network {
        let bytes = local_bytes.unwrap_or_else(|| {
            ListEventsResponse {
                event_bundles: Vec::new(),
                previous_token: String::new(),
                next_token: String::new(),
            }
            .encode_to_vec()
        });
        let observable: Observable<QueryResult<Vec<u8>>> = Observable::new(move |subscriber| {
            subscriber.next(QueryResult {
                data: Some(bytes.clone()),
                status: QueryStatus::Success,
            });
            subscriber.complete();
        });
        return Arc::new(observable);
    }

    // Network path. Build the query_fn and hand off to QueryClient.
    let client = query_client.client().clone();
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

    let underlying = query_client.fetch(query_key, query_fn, merge_profile_responses, opts);

    let Some(local_bytes) = local_bytes else {
        return Arc::new(underlying);
    };

    // Wrap the underlying observable so any `data: None` emission
    // (e.g. the initial Loading before any server has responded) is
    // substituted with the local-store snapshot. The status is left
    // untouched so the UI can still differentiate "loading" from
    // "fresh".
    let wrapped: Observable<QueryResult<Vec<u8>>> = Observable::new(move |subscriber| {
        let subscriber = Arc::new(subscriber);
        let local_bytes = local_bytes.clone();
        let next_subscriber = subscriber.clone();
        let error_subscriber = subscriber.clone();
        let complete_subscriber = subscriber;
        // We deliberately drop the underlying subscription handle —
        // it's only a closed flag; the underlying QueryState retains
        // the subscriber until pruning. Wasted emissions to the
        // closed wrapper are no-ops on the subscriber side.
        let _ = underlying.subscribe(
            move |r: QueryResult<Vec<u8>>| {
                let data = r.data.or_else(|| Some(local_bytes.clone()));
                next_subscriber.next(QueryResult {
                    data,
                    status: r.status,
                });
            },
            move |msg: String| error_subscriber.error(msg),
            move || complete_subscriber.complete(),
        );
    });

    Arc::new(wrapped)
}
