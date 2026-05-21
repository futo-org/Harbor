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
use crate::query::event::dedup::{event_dedup_key, EventDedupKey};
use crate::query::event::key::EventKey;
use crate::query::validation::{retain_validated_bundles, retain_validated_hints};
use crate::query::{channel, QueryClient, QueryKey, QueryObservable, QueryOpts};

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetIdentityFeedArgs {
    pub identity: String,
    pub limit: Option<i32>,
    pub before_token: Option<String>,
    pub after_token: Option<String>,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetFollowingFeedArgs {
    pub follower_identity: String,
    pub limit: Option<i32>,
    pub before_token: Option<String>,
    pub after_token: Option<String>,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetExploreFeedArgs {
    pub identity: Option<String>,
    pub limit: Option<i32>,
    pub before_token: Option<String>,
    pub after_token: Option<String>,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetPostThreadArgs {
    pub event_key: EventKey,
    pub limit: i32,
}

/// Merge function for every feed-RPC observable.
fn merge_feed_responses(values: &[Vec<u8>], _client: &Arc<Mutex<PolycentricClient>>) -> Vec<u8> {
    let mut merged = GetFeedResponse::default();
    for v in values {
        if let Ok(incoming) = GetFeedResponse::decode(v.as_slice()) {
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

    merged.encode_to_vec()
}

/// Pull bundles out of each `EventHint` and copy them into the local
/// client stores. Hints are useful side-information the server
/// provides (e.g. the profile of a post's author).
fn copy_hints(client: &Arc<Mutex<PolycentricClient>>, hints: Vec<EventHint>) {
    let bundles: Vec<EventBundle> = hints.into_iter().filter_map(|h| h.event_bundle).collect();
    if !bundles.is_empty() {
        client.lock().unwrap().copy_bundles(bundles);
    }
}

/// Validates events feed-RPC observables.
fn validated_feed_merge(values: &[Vec<u8>], client: &Arc<Mutex<PolycentricClient>>) -> Vec<u8> {
    let merged = merge_feed_responses(values, client);
    let Ok(mut response) = GetFeedResponse::decode(merged.as_slice()) else {
        return merged;
    };
    let c = client.lock().unwrap();
    retain_validated_bundles(&c, &mut response.event_bundles);
    retain_validated_hints(&c, &mut response.event_hints);
    response.encode_to_vec()
}

/// Validating merge for the post-thread observable. Same as validated_feed_merge above.
fn validated_thread_merge(values: &[Vec<u8>], client: &Arc<Mutex<PolycentricClient>>) -> Vec<u8> {
    let merged = merge_thread_responses(values, client);
    let Ok(mut response) = GetPostThreadResponse::decode(merged.as_slice()) else {
        return merged;
    };
    let c = client.lock().unwrap();
    retain_validated_bundles(&c, &mut response.thread);
    retain_validated_hints(&c, &mut response.event_hints);
    response.encode_to_vec()
}

/// Return posts for an identity.
pub fn get_identity_feed(
    query_client: &QueryClient<Vec<u8>>,
    query_key: QueryKey,
    args: GetIdentityFeedArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetIdentityFeedArgs {
        identity,
        limit,
        before_token,
        after_token,
    } = args;
    let client = query_client.client().clone();

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
            client.lock().unwrap().copy_bundles(response.event_bundles);
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, validated_feed_merge, opts))
}

/// Returns posts an identity is following
pub fn get_following_feed(
    query_client: &QueryClient<Vec<u8>>,
    query_key: QueryKey,
    args: GetFollowingFeedArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetFollowingFeedArgs {
        follower_identity,
        limit,
        before_token,
        after_token,
    } = args;
    let client = query_client.client().clone();

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
            client.lock().unwrap().copy_bundles(response.event_bundles);
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, validated_feed_merge, opts))
}

/// Server-curated explore feed of posts relevant to `identity`.
pub fn get_explore_feed(
    query_client: &QueryClient<Vec<u8>>,
    query_key: QueryKey,
    args: GetExploreFeedArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetExploreFeedArgs {
        identity,
        limit,
        before_token,
        after_token,
    } = args;
    let client = query_client.client().clone();

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
            client.lock().unwrap().copy_bundles(response.event_bundles);
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, validated_feed_merge, opts))
}

/// Merge function for the post-thread observable. Concatenates the
/// `thread` and `event_hints` lists from each per-server response and
/// dedupes each by `EventKey` so duplicate posts/hints coming back
/// from multiple servers only appear once.
fn merge_thread_responses(values: &[Vec<u8>], _client: &Arc<Mutex<PolycentricClient>>) -> Vec<u8> {
    let mut merged = GetPostThreadResponse::default();
    for v in values {
        if let Ok(incoming) = GetPostThreadResponse::decode(v.as_slice()) {
            merged.thread.extend(incoming.thread);
            merged.event_hints.extend(incoming.event_hints);
        }
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
    query_client: &QueryClient<Vec<u8>>,
    query_key: QueryKey,
    args: GetPostThreadArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetPostThreadArgs { event_key, limit } = args;
    let request = GetPostThreadRequest {
        event_key: Some(event_key.into()),
        limit,
    };

    let client = query_client.client().clone();

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
            client.lock().unwrap().copy_bundles(response.thread);
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, validated_thread_merge, opts))
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
            event_proofs: Vec::new(),
        }
    }

    fn test_client() -> Arc<Mutex<PolycentricClient>> {
        Arc::new(Mutex::new(PolycentricClient::new()))
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
            event_proofs: Vec::new(),
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
            event_proofs: Vec::new(),
        };
        assert!(event_dedup_key(&bundle).is_none());
    }

    #[test]
    fn merge_concatenates_when_no_overlap() {
        let prev = encode_response(vec![make_bundle(2, "a", 1, vec![1], 1)], vec![]);
        let new = encode_response(vec![make_bundle(2, "b", 1, vec![2], 1)], vec![]);

        let merged = merge_feed_responses(&[prev, new], &test_client());
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

        let merged = merge_feed_responses(&[prev, new], &test_client());
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

        let merged = merge_feed_responses(&[prev, new], &test_client());
        let decoded = GetFeedResponse::decode(merged.as_slice()).unwrap();
        assert_eq!(decoded.event_hints.len(), 1);
    }

    #[test]
    fn merge_handles_no_prior_value() {
        let new = encode_response(vec![make_bundle(2, "a", 1, vec![1], 1)], vec![]);
        let merged = merge_feed_responses(&[new], &test_client());
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
            event_proofs: Vec::new(),
        };
        let new = encode_response(vec![parseable, unparseable.clone(), unparseable], vec![]);
        let merged = merge_feed_responses(&[new], &test_client());
        // Parseable + both unparseables retained (no dedup key to compare).
        let decoded = GetFeedResponse::decode(merged.as_slice()).unwrap();
        assert_eq!(decoded.event_bundles.len(), 3);
    }
}
