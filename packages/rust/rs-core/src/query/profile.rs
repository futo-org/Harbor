use std::sync::Arc;

use polycentric_common::models::collections;
use polycentric_common::models::protos_v2::{
    EventHint, GetProfileRequest, GetProfileResponse, profile_service_client::ProfileServiceClient,
};
use prost::Message;

use crate::lock::LockRecover;
use crate::query::client::fetch_local_first;
use crate::query::event::merge::{decode_event, merge_event_bundles, merge_event_hints};
use crate::query::validation::{retain_validated_bundles, retain_validated_hints};
use crate::query::{QueryClient, QueryKey, QueryObservable, QueryOpts, channel};
use crate::store::keys::EventKey as StoreEventKey;

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
/// event store, with the labels on them as hints, returning `None` when
/// the store has nothing for this identity. The follow counters are
/// server aggregates, so local snapshots report zero until a server
/// responds.
fn local_profile_bytes(query_client: &QueryClient<Vec<u8>>, identity: &str) -> Option<Vec<u8>> {
    let client = query_client.client().lock_recover();
    let bundles = client
        .list_valid_events(identity, collections::PROFILE)
        .unwrap_or_default();
    if bundles.is_empty() {
        return None;
    }
    let mut event_hints: Vec<EventHint> = bundles
        .iter()
        .filter_map(decode_event)
        .filter_map(|event| StoreEventKey::from_event(event).ok())
        .flat_map(|key| client.label_bundles_for(&key))
        .map(|bundle| EventHint {
            event_bundle: Some(bundle),
        })
        .collect();
    retain_validated_hints(&client, &mut event_hints);
    Some(
        GetProfileResponse {
            event_bundles: bundles,
            event_hints,
            following_count: 0,
            followers_count: 0,
        }
        .encode_to_vec(),
    )
}

/// Fetch `identity`'s profile (its `PROFILE` collection events plus the
/// follow counters). Emits serialized `GetProfileResponse` bytes. The local
/// store answers first, following `fetch_mode` (`fetch_local_first`).
pub fn get_profile(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: GetProfileArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetProfileArgs { identity } = args;

    let local_bytes = local_profile_bytes(query_client, &identity);

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

    fetch_local_first(local_bytes, opts, |opts| {
        query_client.fetch(query_key, query_fn, merge_profile_responses, opts)
    })
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
