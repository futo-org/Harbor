use std::sync::Arc;

use polycentric_common::models::collections;
use polycentric_common::models::protos_v2::{
    GetProfileRequest, GetProfileResponse, profile_service_client::ProfileServiceClient,
};
use prost::Message;

use crate::lock::LockRecover;
use crate::query::event::merge::{merge_event_bundles, merge_event_hints};
use crate::query::validation::{retain_validated_bundles, retain_validated_hints};
use crate::query::{
    FetchMode, QueryClient, QueryKey, QueryObservable, QueryOpts, QueryResult, QueryStatus, channel,
};
use crate::rx::observable::Observable;

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetProfileArgs {
    pub identity: String,
}

/// Concatenate per-server profile bundles (deduped, validated) and take
/// the largest counters — the best-informed server wins.
fn merge_profile_responses(
    values: &[Vec<u8>],
    _previous: Option<&Vec<u8>>,
    client: &std::sync::Arc<std::sync::Mutex<crate::client::PolycentricClient>>,
) -> Vec<u8> {
    let mut merged = GetProfileResponse::default();
    for v in values {
        if let Ok(incoming) = GetProfileResponse::decode(v.as_slice()) {
            merged.event_bundles.extend(incoming.event_bundles);
            merged.event_hints.extend(incoming.event_hints);
            merged.following_count = merged.following_count.max(incoming.following_count);
            merged.followers_count = merged.followers_count.max(incoming.followers_count);
        }
    }

    merge_event_bundles(&mut merged.event_bundles);
    merge_event_hints(&mut merged.event_hints);

    {
        let c = client.lock_recover();
        retain_validated_bundles(&c, &mut merged.event_bundles);
        retain_validated_hints(&c, &mut merged.event_hints);
    }

    merged.encode_to_vec()
}

/// Encode `identity`'s `PROFILE` collection events out of the local
/// event store, returning `None` when the store has nothing for this
/// identity. The follow counters are server aggregates, so local
/// snapshots report zero until a server responds.
fn local_profile_bytes(query_client: &QueryClient<Vec<u8>>, identity: &str) -> Option<Vec<u8>> {
    let bundles = query_client
        .client()
        .lock_recover()
        .list_valid_events(identity, collections::PROFILE)
        .unwrap_or_default();
    if bundles.is_empty() {
        return None;
    }
    Some(
        GetProfileResponse {
            event_bundles: bundles,
            event_hints: Vec::new(),
            following_count: 0,
            followers_count: 0,
        }
        .encode_to_vec(),
    )
}

/// Fetch `identity`'s profile (its `PROFILE` collection events plus the
/// follow counters). Emits serialized `GetProfileResponse` bytes.
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
    query_key: Option<QueryKey>,
    args: GetProfileArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetProfileArgs { identity } = args;
    let fetch_mode = opts.as_ref().and_then(|o| o.fetch_mode);

    let local_bytes = local_profile_bytes(query_client, &identity);

    let offline_only = matches!(fetch_mode, Some(FetchMode::OfflineOnly));
    let offline_first = matches!(fetch_mode, Some(FetchMode::OfflineFirst));
    let skip_network = offline_only || (offline_first && local_bytes.is_some());
    if skip_network {
        let bytes = local_bytes.unwrap_or_else(|| GetProfileResponse::default().encode_to_vec());
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

    // Network path. Build the query_fn and hand off to QueryClient.
    let client = query_client.client().clone();
    let query_fn = move |server_url: String| {
        let identity = identity.clone();
        let client = client.clone();
        async move {
            let response = ProfileServiceClient::new(channel(&server_url).await?)
                .get_profile(GetProfileRequest { identity })
                .await
                .map_err(|e| format!("get_profile [{server_url}]: {e}"))?
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
        // the fan-out completes on its own once every server has
        // responded.
        let _ = underlying.subscribe(
            move |r: QueryResult<Vec<u8>>| {
                let data = r.data.or_else(|| Some(local_bytes.clone()));
                next_subscriber.next(QueryResult {
                    data,
                    status: r.status,
                    successful_servers: r.successful_servers,
                    pending_servers: r.pending_servers,
                });
            },
            move |msg: String| error_subscriber.error(msg),
            move || complete_subscriber.complete(),
        );
    });

    Arc::new(wrapped)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::client::PolycentricClient;
    use std::sync::Mutex;

    fn client() -> Arc<Mutex<PolycentricClient>> {
        Arc::new(Mutex::new(PolycentricClient::new()))
    }

    fn response(following: u64, followers: u64) -> Vec<u8> {
        GetProfileResponse {
            event_bundles: Vec::new(),
            event_hints: Vec::new(),
            following_count: following,
            followers_count: followers,
        }
        .encode_to_vec()
    }

    #[test]
    fn merge_takes_the_largest_counters() {
        let merged = merge_profile_responses(&[response(3, 7), response(5, 2)], None, &client());
        let decoded = GetProfileResponse::decode(merged.as_slice()).unwrap();
        assert_eq!(decoded.following_count, 5);
        assert_eq!(decoded.followers_count, 7);
    }

    #[test]
    fn merge_ignores_undecodable_responses() {
        let merged = merge_profile_responses(&[vec![0xff], response(1, 2)], None, &client());
        let decoded = GetProfileResponse::decode(merged.as_slice()).unwrap();
        assert_eq!(decoded.following_count, 1);
        assert_eq!(decoded.followers_count, 2);
    }

    #[test]
    fn merge_of_nothing_reports_zero_counters() {
        let merged = merge_profile_responses(&[], None, &client());
        let decoded = GetProfileResponse::decode(merged.as_slice()).unwrap();
        assert_eq!(decoded.following_count, 0);
        assert_eq!(decoded.followers_count, 0);
    }
}
