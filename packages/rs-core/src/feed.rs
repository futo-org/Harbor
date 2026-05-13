//! Feed-service RPCs surfaced as observables via `Query`.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use polycentric_common::models::protos_v2::{
    feeds_service_client::FeedsServiceClient, EventBundle, EventHint, FeedPageParams,
    GetExploreFeedRequest, GetFeedResponse, GetFollowingFeedRequest, GetIdentityFeedRequest,
    GetPostThreadRequest, GetPostThreadResponse,
};
use prost::Message;

use crate::client::PolycentricClient;
use crate::event::dedup::{event_dedup_key, EventDedupKey};
use crate::event::key::EventKey;
use crate::query::{FetchMode, Query, QueryObservable};
use crate::transport::channel;

/// Merge function for every feed-RPC observable. Concatenates `event_bundles` +
/// `event_hints`, then dedupes each list by `EventKey` so the cached
/// value never contains the same event twice (e.g. when multiple
/// servers return the same post).
fn merge_feed_responses(prev: Option<Vec<u8>>, new: Vec<u8>) -> Vec<u8> {
    let mut merged = prev
        .as_deref()
        .and_then(|b| GetFeedResponse::decode(b).ok())
        .unwrap_or_default();
    if let Ok(incoming) = GetFeedResponse::decode(new.as_slice()) {
        merged.event_bundles.extend(incoming.event_bundles);
        merged.event_hints.extend(incoming.event_hints);
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

    merged.encode_to_vec()
}

/// Pull bundles out of each `EventHint` and copy them into the local
/// client stores. Hints are useful side-information the server
/// volunteers (e.g. the profile of a post's author) — caching them
/// avoids extra round-trips when the UI later asks for that data.
fn copy_hints(client: &Arc<Mutex<PolycentricClient>>, hints: Vec<EventHint>) {
    let bundles: Vec<EventBundle> = hints.into_iter().filter_map(|h| h.event_bundle).collect();
    if !bundles.is_empty() {
        client.lock().unwrap().copy_bundles(bundles);
    }
}

/// Return posts for an identity.
pub fn get_identity_feed(
    query: &Query<Vec<u8>>,
    identity: String,
    limit: Option<i32>,
    before_token: Option<String>,
    after_token: Option<String>,
    fetch_mode: Option<FetchMode>,
) -> Arc<dyn QueryObservable> {
    let cache_key = format!(
        "identity_feed:{identity}:limit={limit:?}:before={before_token:?}:after={after_token:?}"
    );
    let client = query.client().clone();

    let query_fn = move |server_url: String| {
        let identity = identity.clone();
        let before_token = before_token.clone();
        let after_token = after_token.clone();
        let client = client.clone();
        async move {
            let response = FeedsServiceClient::new(channel(&server_url)?)
                .get_identity_feed(GetIdentityFeedRequest {
                    identity,
                    page_params: Some(FeedPageParams {
                        limit,
                        before_token,
                        after_token,
                    }),
                })
                .await
                .map_err(|e| format!("get_identity_feed [{server_url}]: {e}"))?
                .into_inner();
            let bytes = response.encode_to_vec();
            copy_hints(&client, response.event_hints);
            Ok(bytes)
        }
    };

    Arc::new(query.query(cache_key, query_fn, Some(merge_feed_responses), fetch_mode))
}

/// Returns posts an identity is following
pub fn get_following_feed(
    query: &Query<Vec<u8>>,
    follower_identity: String,
    limit: Option<i32>,
    before_token: Option<String>,
    after_token: Option<String>,
    fetch_mode: Option<FetchMode>,
) -> Arc<dyn QueryObservable> {
    let cache_key = format!(
        "following_feed:{follower_identity}:limit={limit:?}:before={before_token:?}:after={after_token:?}"
    );
    let client = query.client().clone();

    let query_fn = move |server_url: String| {
        let follower_identity = follower_identity.clone();
        let before_token: Option<String> = before_token.clone();
        let after_token = after_token.clone();
        let client = client.clone();
        async move {
            let response = FeedsServiceClient::new(channel(&server_url)?)
                .get_following_feed(GetFollowingFeedRequest {
                    follower_identity,
                    page_params: Some(FeedPageParams {
                        limit,
                        before_token,
                        after_token,
                    }),
                })
                .await
                .map_err(|e| format!("get_following_feed [{server_url}]: {e}"))?
                .into_inner();
            let bytes = response.encode_to_vec();
            copy_hints(&client, response.event_hints);
            Ok(bytes)
        }
    };

    Arc::new(query.query(cache_key, query_fn, Some(merge_feed_responses), fetch_mode))
}

/// Server-curated explore feed of posts relevant to `identity`.
pub fn get_explore_feed(
    query: &Query<Vec<u8>>,
    identity: Option<String>,
    limit: Option<i32>,
    before_token: Option<String>,
    after_token: Option<String>,
    fetch_mode: Option<FetchMode>,
) -> Arc<dyn QueryObservable> {
    let cache_key = format!(
        "explore_feed:{identity:?}:limit={limit:?}:before={before_token:?}:after={after_token:?}"
    );
    let client = query.client().clone();

    let query_fn = move |server_url: String| {
        let identity = identity.clone();
        let before_token = before_token.clone();
        let after_token = after_token.clone();
        let client = client.clone();
        async move {
            let response = FeedsServiceClient::new(channel(&server_url)?)
                .get_explore_feed(GetExploreFeedRequest {
                    identity,
                    page_params: Some(FeedPageParams {
                        limit,
                        before_token,
                        after_token,
                    }),
                })
                .await
                .map_err(|e| format!("get_explore_feed [{server_url}]: {e}"))?
                .into_inner();
            let bytes = response.encode_to_vec();
            copy_hints(&client, response.event_hints);
            Ok(bytes)
        }
    };

    Arc::new(query.query(cache_key, query_fn, Some(merge_feed_responses), fetch_mode))
}

/// Merge function for the post-thread observable. Concatenates the
/// `thread` and `event_hints` lists from each per-server response and
/// dedupes each by `EventKey` so duplicate posts/hints coming back
/// from multiple servers only appear once.
fn merge_thread_responses(prev: Option<Vec<u8>>, new: Vec<u8>) -> Vec<u8> {
    let mut merged = prev
        .as_deref()
        .and_then(|b| GetPostThreadResponse::decode(b).ok())
        .unwrap_or_default();
    if let Ok(incoming) = GetPostThreadResponse::decode(new.as_slice()) {
        merged.thread.extend(incoming.thread);
        merged.event_hints.extend(incoming.event_hints);
    }

    let mut seen_thread: HashSet<EventDedupKey> = HashSet::new();
    merged
        .thread
        .retain(|bundle| match event_dedup_key(bundle) {
            Some(k) => seen_thread.insert(k),
            None => true,
        });

    let mut seen_hints: HashSet<EventDedupKey> = HashSet::new();
    merged.event_hints.retain(
        |hint| match hint.event_bundle.as_ref().and_then(event_dedup_key) {
            Some(k) => seen_hints.insert(k),
            None => true,
        },
    );

    merged.encode_to_vec()
}

/// Fetch a parent post and its direct replies. `event_key` identifies
/// the parent post. Fans out to every configured server and emits the
/// merged `GetPostThreadResponse` progressively; each response's
/// `event_hints` are persisted to the local store so author profiles
/// don't need to be re-fetched later.
pub fn get_post_thread(
    query: &Query<Vec<u8>>,
    event_key: EventKey,
    limit: i32,
    fetch_mode: Option<FetchMode>,
) -> Arc<dyn QueryObservable> {
    let cache_key = format!(
        "post_thread:{}:{}:{}:{:?}:{}:{}",
        event_key.collection,
        event_key.identity,
        event_key.signed_by.key_type,
        event_key.signed_by.key,
        event_key.sequence,
        limit,
    );

    let request = GetPostThreadRequest {
        event_key: Some(event_key.into()),
        limit,
    };

    let client = query.client().clone();

    let query_fn = move |server_url: String| {
        let request = request.clone();
        let client = client.clone();
        async move {
            let response = FeedsServiceClient::new(channel(&server_url)?)
                .get_post_thread(request)
                .await
                .map_err(|e| format!("get_post_thread [{server_url}]: {e}"))?
                .into_inner();
            let bytes = response.encode_to_vec();
            copy_hints(&client, response.event_hints);
            Ok(bytes)
        }
    };

    Arc::new(query.query(
        cache_key,
        query_fn,
        Some(merge_thread_responses),
        fetch_mode,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use polycentric_common::models::protos_v2::{
        Event, EventBundle, EventHint, EventKey, GetFeedResponse, PublicKey, SignedEvent,
    };

    fn make_bundle(
        collection: i32,
        identity: &str,
        key_type: i32,
        key: Vec<u8>,
        sequence: u64,
    ) -> EventBundle {
        let event = Event {
            key: Some(EventKey {
                collection,
                identity: identity.to_string(),
                signed_by: Some(PublicKey { key_type, key }),
                sequence,
            }),
            ..Default::default()
        };
        EventBundle {
            signed_event: Some(SignedEvent {
                signature: Vec::new(),
                event_bytes: event.encode_to_vec(),
            }),
            serialized_content: None,
        }
    }

    fn encode_response(bundles: Vec<EventBundle>, hints: Vec<EventBundle>) -> Vec<u8> {
        GetFeedResponse {
            event_bundles: bundles,
            event_hints: hints
                .into_iter()
                .map(|b| EventHint {
                    event_bundle: Some(b),
                })
                .collect(),
        }
        .encode_to_vec()
    }

    #[test]
    fn event_dedup_key_extracts_tuple() {
        let bundle = make_bundle(2, "id-a", 1, vec![0xAA], 5);
        let key = event_dedup_key(&bundle).expect("key");
        assert_eq!(key, (2, "id-a".to_string(), 1, vec![0xAA], 5));
    }

    #[test]
    fn event_dedup_key_returns_none_for_missing_signed_event() {
        let bundle = EventBundle {
            signed_event: None,
            serialized_content: None,
        };
        assert!(event_dedup_key(&bundle).is_none());
    }

    #[test]
    fn event_dedup_key_returns_none_for_invalid_event_bytes() {
        let bundle = EventBundle {
            signed_event: Some(SignedEvent {
                signature: Vec::new(),
                event_bytes: vec![0xFF, 0xFF, 0xFF],
            }),
            serialized_content: None,
        };
        assert!(event_dedup_key(&bundle).is_none());
    }

    #[test]
    fn merge_concatenates_when_no_overlap() {
        let prev = encode_response(vec![make_bundle(2, "a", 1, vec![1], 1)], vec![]);
        let new = encode_response(vec![make_bundle(2, "b", 1, vec![2], 1)], vec![]);

        let merged = merge_feed_responses(Some(prev), new);
        let decoded = GetFeedResponse::decode(merged.as_slice()).unwrap();
        assert_eq!(decoded.event_bundles.len(), 2);
    }

    #[test]
    fn merge_dedupes_event_bundles_by_event_key() {
        let dup = make_bundle(2, "a", 1, vec![1], 1);
        let prev = encode_response(vec![dup.clone()], vec![]);
        let new = encode_response(
            vec![dup.clone(), make_bundle(2, "a", 1, vec![1], 2)],
            vec![],
        );

        let merged = merge_feed_responses(Some(prev), new);
        let decoded = GetFeedResponse::decode(merged.as_slice()).unwrap();
        assert_eq!(decoded.event_bundles.len(), 2);
        let seqs: Vec<u64> = decoded
            .event_bundles
            .iter()
            .filter_map(|b| event_dedup_key(b).map(|k| k.4))
            .collect();
        assert_eq!(seqs, vec![1, 2]);
    }

    #[test]
    fn merge_dedupes_hints_by_event_key() {
        let dup = make_bundle(2, "a", 1, vec![9], 7);
        let prev = encode_response(vec![], vec![dup.clone()]);
        let new = encode_response(vec![], vec![dup.clone()]);

        let merged = merge_feed_responses(Some(prev), new);
        let decoded = GetFeedResponse::decode(merged.as_slice()).unwrap();
        assert_eq!(decoded.event_hints.len(), 1);
    }

    #[test]
    fn merge_handles_no_prior_value() {
        let new = encode_response(vec![make_bundle(2, "a", 1, vec![1], 1)], vec![]);
        let merged = merge_feed_responses(None, new);
        let decoded = GetFeedResponse::decode(merged.as_slice()).unwrap();
        assert_eq!(decoded.event_bundles.len(), 1);
    }

    #[test]
    fn merge_retains_unparseable_bundles_without_dedup() {
        let parseable = make_bundle(2, "a", 1, vec![1], 1);
        let unparseable = EventBundle {
            signed_event: Some(SignedEvent {
                signature: Vec::new(),
                event_bytes: vec![0xFF, 0xFF, 0xFF],
            }),
            serialized_content: None,
        };
        let new = encode_response(vec![parseable, unparseable.clone(), unparseable], vec![]);
        let merged = merge_feed_responses(None, new);
        // Parseable + both unparseables retained (no dedup key to compare).
        let decoded = GetFeedResponse::decode(merged.as_slice()).unwrap();
        assert_eq!(decoded.event_bundles.len(), 3);
    }
}
