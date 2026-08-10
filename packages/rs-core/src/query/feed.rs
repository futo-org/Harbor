//! Feed-service RPCs surfaced as observables via `Query`.

use std::cmp::Reverse;
use std::sync::{Arc, Mutex};

use polycentric_common::models::protos_v2::{
    Event, EventBundle, EventHint, GetExploreFeedRequest, GetFeedResponse, GetFollowingFeedRequest,
    GetIdentityFeedRequest, GetPostThreadRequest, GetPostThreadResponse, PageParams,
    feeds_service_client::FeedsServiceClient,
};
use prost::Message;

use crate::{
    client::PolycentricClient,
    query::{
        QueryClient, QueryKey, QueryObservable, QueryOpts, channel,
        event::{
            key::EventKey,
            merge::{
                EventBundleResponse, copy_hints, merge_bundle_responses, merge_event_bundles,
                merge_event_hints,
            },
        },
        pagination::{FakeCursorToken, merge_page_info, prepare_page_info},
        validation::{retain_validated_bundles, retain_validated_hints},
    },
};

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetIdentityFeedArgs {
    pub identity: String,
    pub limit: Option<i32>,
    pub backward_token: Option<String>,
    pub forward_token: Option<String>,
    pub omit_labels: Vec<String>,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetFollowingFeedArgs {
    pub follower_identity: String,
    pub limit: Option<i32>,
    pub backward_token: Option<String>,
    pub forward_token: Option<String>,
    pub omit_labels: Vec<String>,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetExploreFeedArgs {
    pub identity: Option<String>,
    pub limit: Option<i32>,
    pub backward_token: Option<String>,
    pub forward_token: Option<String>,
    pub omit_labels: Vec<String>,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetPostThreadArgs {
    pub event_key: EventKey,
    pub limit: i32,
}

/// Merge function for every feed-RPC observable
fn validated_feed_merge(values: &[Vec<u8>], client: &Arc<Mutex<PolycentricClient>>) -> Vec<u8> {
    do_feed_merge(values, client, true)
}

/// TODO: remove.
/// currently only used in tests.
#[allow(dead_code)]
fn merge_feed_responses(values: &[Vec<u8>], client: &Arc<Mutex<PolycentricClient>>) -> Vec<u8> {
    do_feed_merge(values, client, false)
}

fn do_feed_merge(
    values: &[Vec<u8>],
    client: &Arc<Mutex<PolycentricClient>>,
    validate: bool,
) -> Vec<u8> {
    let mut response = GetFeedResponse::default();
    for v in values {
        if let Ok(incoming) = GetFeedResponse::decode(v.as_slice()) {
            response.event_bundles.extend(incoming.event_bundles);
            response.event_hints.extend(incoming.event_hints);
            response.page_info = merge_page_info(response.page_info, incoming.page_info);
        }
    }

    merge_event_bundles(&mut response.event_bundles);
    merge_event_hints(&mut response.event_hints);

    if validate {
        let c = client.lock().unwrap();
        retain_validated_bundles(&c, &mut response.event_bundles);
        retain_validated_hints(&c, &mut response.event_hints);
    }

    // Ensure the merged events are sorted in feed order
    response.event_bundles.sort_by_cached_key(|bundle| {
        let created_at = bundle
            .signed_event
            .as_ref()
            // Events we cannot decode will be mapped to `None` and sorted at the end.
            .and_then(|se| Event::decode(se.event_bytes.as_slice()).ok())
            .map(|event| event.created_at);

        Reverse(created_at)
    });

    response.encode_to_vec()
}

/// Thread responses follow the shape of events + hints, except the events
/// are stored in `self.thread`.
impl EventBundleResponse for GetPostThreadResponse {
    fn bundles_mut(&mut self) -> &mut Vec<EventBundle> {
        &mut self.thread
    }
    fn hints_mut(&mut self) -> &mut Vec<EventHint> {
        &mut self.event_hints
    }
}

/// Return posts for an identity.
pub fn get_identity_feed(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: GetIdentityFeedArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetIdentityFeedArgs {
        identity,
        limit,
        backward_token,
        forward_token,
        omit_labels,
    } = args;
    let client = query_client.client().clone();

    let query_fn = move |server_url: String| {
        let identity = identity.clone();
        let omit_labels = omit_labels.clone();
        let client = client.clone();

        let (backward_token, backward_offset) =
            FakeCursorToken::extract(&backward_token, &server_url);
        let (forward_token, forward_offset) = FakeCursorToken::extract(&forward_token, &server_url);

        async move {
            let mut response = FeedsServiceClient::new(channel(&server_url).await?)
                .get_identity_feed(GetIdentityFeedRequest {
                    identity,
                    page_params: Some(PageParams {
                        limit,
                        backward_token,
                        forward_token,
                    }),
                    omit_labels,
                })
                .await
                .map_err(|e| format!("get_identity_feed [{server_url}]: {e}"))?
                .into_inner();

            prepare_page_info(
                &mut response.page_info,
                &server_url,
                backward_offset,
                forward_offset,
            )?;
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
    query_key: Option<QueryKey>,
    args: GetFollowingFeedArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetFollowingFeedArgs {
        follower_identity,
        limit,
        backward_token,
        forward_token,
        omit_labels,
    } = args;
    let client = query_client.client().clone();

    let query_fn = move |server_url: String| {
        let follower_identity = follower_identity.clone();
        let omit_labels = omit_labels.clone();
        let client = client.clone();

        let (backward_token, backward_offset) =
            FakeCursorToken::extract(&backward_token, &server_url);
        let (forward_token, forward_offset) = FakeCursorToken::extract(&forward_token, &server_url);

        async move {
            let mut response = FeedsServiceClient::new(channel(&server_url).await?)
                .get_following_feed(GetFollowingFeedRequest {
                    follower_identity,
                    page_params: Some(PageParams {
                        limit,
                        backward_token,
                        forward_token,
                    }),
                    omit_labels,
                })
                .await
                .map_err(|e| format!("get_following_feed [{server_url}]: {e}"))?
                .into_inner();

            prepare_page_info(
                &mut response.page_info,
                &server_url,
                backward_offset,
                forward_offset,
            )?;
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
    query_key: Option<QueryKey>,
    args: GetExploreFeedArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetExploreFeedArgs {
        identity,
        limit,
        backward_token,
        forward_token,
        omit_labels,
    } = args;
    let client = query_client.client().clone();

    let query_fn = move |server_url: String| {
        let identity = identity.clone();
        let omit_labels = omit_labels.clone();
        let client = client.clone();

        let (backward_token, backward_offset) =
            FakeCursorToken::extract(&backward_token, &server_url);
        let (forward_token, forward_offset) = FakeCursorToken::extract(&forward_token, &server_url);

        async move {
            let mut response = FeedsServiceClient::new(channel(&server_url).await?)
                .get_explore_feed(GetExploreFeedRequest {
                    identity: identity.clone(),
                    page_params: Some(PageParams {
                        limit,
                        backward_token,
                        forward_token,
                    }),
                    omit_labels,
                })
                .await
                .map_err(|e| format!("get_explore_feed [{server_url}]: {e}"))?
                .into_inner();

            prepare_page_info(
                &mut response.page_info,
                &server_url,
                backward_offset,
                forward_offset,
            )?;
            let bytes = response.encode_to_vec();

            copy_hints(&client, response.event_hints);
            client.lock().unwrap().copy_bundles(response.event_bundles);
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, validated_feed_merge, opts))
}

/// Fetch a parent post and its direct replies. `event_key` identifies
/// the parent post. Fans out to every configured server and emits the
/// merged `GetPostThreadResponse` progressively; each response's
/// `event_hints` are persisted to the local store so author profiles
/// don't need to be re-fetched later.
pub fn get_post_thread(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: GetPostThreadArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetPostThreadArgs { event_key, limit } = args;
    let request = GetPostThreadRequest {
        event_key: Some(event_key.into()),
        limit,
        omit_labels: vec![],
    };

    let client = query_client.client().clone();

    let query_fn = move |server_url: String| {
        let request = request.clone();
        let client = client.clone();
        async move {
            let response = FeedsServiceClient::new(channel(&server_url).await?)
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

    Arc::new(query_client.fetch(
        query_key,
        query_fn,
        merge_bundle_responses::<GetPostThreadResponse>,
        opts,
    ))
}

#[cfg(test)]
mod tests {
    use crate::query::event::merge::event_dedup_key;

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
            meta: None,
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
            page_info: None,
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
            meta: None,
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
            meta: None,
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
            meta: None,
        };
        let new = encode_response(vec![parseable, unparseable.clone(), unparseable], vec![]);
        let merged = merge_feed_responses(&[new], &test_client());
        // Parseable + both unparseables retained (no dedup key to compare).
        let decoded = GetFeedResponse::decode(merged.as_slice()).unwrap();
        assert_eq!(decoded.event_bundles.len(), 3);
    }
}
