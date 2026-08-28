//! Feed-service RPCs surfaced as observables via `Query`.

use std::cmp::Reverse;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use polycentric_common::models::protos_v2::{
    AttributedTo, EventBundle, EventHint, GetAttributionFeedRequest, GetExploreFeedRequest,
    GetFeedResponse, GetFollowingFeedRequest, GetIdentityFeedRequest, GetPostThreadRequest,
    GetPostThreadResponse, PageParams, SortPostsBy, feeds_service_client::FeedsServiceClient,
};
use prost::Message;

use crate::lock::LockRecover;
use crate::{
    client::PolycentricClient,
    query::{
        QueryClient, QueryKey, QueryObservable, QueryOpts,
        blocks::{
            retain_unblocked_bundles, retain_unblocked_hints, retain_unblocked_thread_bundles,
        },
        channel,
        event::{
            key::EventKey,
            merge::{
                EventBundleResponse, EventDedupKey, bundle_upvote_count, copy_hints, decode_event,
                dedup_key, event_dedup_key, merge_bundle_response, merge_event_bundles,
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
    /// Posts the emission may carry; the rest is held back.
    pub window_size: Option<i32>,
}

/// Order a sortable feed is returned in. `Top` ranks by reaction count,
/// the others by creation time.
#[derive(Clone, Copy, Debug, uniffi::Enum)]
pub enum FeedSort {
    Default,
    Top,
    Latest,
}

impl From<FeedSort> for SortPostsBy {
    fn from(sort: FeedSort) -> Self {
        match sort {
            FeedSort::Default => SortPostsBy::Default,
            FeedSort::Top => SortPostsBy::Top,
            FeedSort::Latest => SortPostsBy::Latest,
        }
    }
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetFollowingFeedArgs {
    pub follower_identity: String,
    pub sort_by: Option<FeedSort>,
    pub limit: Option<i32>,
    pub backward_token: Option<String>,
    pub forward_token: Option<String>,
    pub omit_labels: Vec<String>,
    /// Posts the emission may carry; the rest is held back.
    pub window_size: Option<i32>,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetExploreFeedArgs {
    pub identity: Option<String>,
    pub sort_by: Option<FeedSort>,
    pub limit: Option<i32>,
    pub backward_token: Option<String>,
    pub forward_token: Option<String>,
    pub omit_labels: Vec<String>,
    /// Posts the emission may carry; the rest is held back.
    pub window_size: Option<i32>,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetPostThreadArgs {
    pub event_key: EventKey,
    pub limit: i32,
    pub omit_labels: Vec<String>,
}

#[derive(Clone, Debug, uniffi::Record)]
pub struct GetAttributionFeedArgs {
    /// Serialized `AttributedTo` proto to match posts against. Passed as
    /// bytes so the whole (future-extensible) message crosses the FFI
    /// intact; decoded server-side by URL for the link case.
    pub attributed_to: Vec<u8>,
    pub limit: Option<i32>,
    pub backward_token: Option<String>,
    pub forward_token: Option<String>,
    pub omit_labels: Vec<String>,
    /// Posts the emission may carry; the rest is held back.
    pub window_size: Option<i32>,
}

/// The key servers ordered a feed by. Merging has to order pages by the
/// same key, or it would rearrange the ranking the server sent. Higher
/// keys come first.
#[derive(Clone, Copy)]
enum FeedOrder {
    CreatedAt,
    Upvotes,
}

/// Servers tune their gravity dynamically; this is only their seed value.
const FEED_GRAVITY: f64 = 1.8;

impl FeedOrder {
    fn key(self, bundle: &EventBundle, created_at: Option<u64>, now_ms: u64) -> Option<u64> {
        match self {
            Self::CreatedAt => created_at,
            Self::Upvotes => Some(decayed_upvote_key(bundle, created_at, now_ms)),
        }
    }
}

/// The score servers rank top feeds by: `count / (hours + 2) ^ gravity`
/// (the server's `reaction_count_decay`). `to_bits` preserves the order
/// of non-negative floats.
fn decayed_upvote_key(bundle: &EventBundle, created_at: Option<u64>, now_ms: u64) -> u64 {
    let count = bundle_upvote_count(bundle) as f64;
    let age_ms = created_at.map_or(0, |created| now_ms.saturating_sub(created));
    let hours = age_ms as f64 / 3_600_000.0;
    (count / (hours + 2.0).powf(FEED_GRAVITY)).to_bits()
}

#[cfg(not(target_arch = "wasm32"))]
fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(target_arch = "wasm32")]
fn now_ms() -> u64 {
    js_sys::Date::now() as u64
}

impl From<FeedSort> for FeedOrder {
    fn from(sort: FeedSort) -> Self {
        match sort {
            FeedSort::Top => Self::Upvotes,
            FeedSort::Default | FeedSort::Latest => Self::CreatedAt,
        }
    }
}

/// Merge function for every feed-RPC observable
#[allow(clippy::type_complexity)] // It is `MergeFn`'s shape, unboxed.
fn validated_feed_merge(
    order: FeedOrder,
    window_size: Option<i32>,
) -> impl Fn(&[Vec<u8>], Option<&Vec<u8>>, &Arc<Mutex<PolycentricClient>>) -> Vec<u8>
+ Send
+ Sync
+ 'static {
    move |values, previous, client| {
        do_feed_merge(values, previous, client, true, order, window_size)
    }
}

/// TODO: remove.
/// currently only used in tests.
#[allow(dead_code)]
fn merge_feed_responses(
    values: &[Vec<u8>],
    previous: Option<&Vec<u8>>,
    client: &Arc<Mutex<PolycentricClient>>,
) -> Vec<u8> {
    do_feed_merge(values, previous, client, false, FeedOrder::CreatedAt, None)
}

fn do_feed_merge(
    values: &[Vec<u8>],
    previous: Option<&Vec<u8>>,
    client: &Arc<Mutex<PolycentricClient>>,
    validate: bool,
    order: FeedOrder,
    window_size: Option<i32>,
) -> Vec<u8> {
    // Every bundle decays against the same moment.
    let now_ms = now_ms();

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

    {
        let c = client.lock_recover();
        if validate {
            retain_validated_bundles(&c, &mut response.event_bundles);
            retain_validated_hints(&c, &mut response.event_hints);
        }

        let blocked = c.blocked_identities();
        retain_unblocked_bundles(&blocked, &mut response.event_bundles);
        retain_unblocked_hints(&blocked, &mut response.event_hints);
    }

    // Rank only what nobody has seen; anything else moves the feed.
    let anchor = anchored_positions(previous);
    let anchored = anchor.len();

    // Anchored first, then rank; created_at and the key break ties. One
    // decode per bundle: the whole key comes from the same event.
    response.event_bundles.sort_by_cached_key(|bundle| {
        let event = decode_event(bundle);
        let key = event.as_ref().and_then(dedup_key);
        let created_at = event.map(|event| event.created_at);
        (
            key.as_ref()
                .and_then(|key| anchor.get(key).copied())
                .unwrap_or(usize::MAX),
            Reverse(order.key(bundle, created_at, now_ms)),
            Reverse(created_at),
            key,
        )
    });

    // Held-back posts stay in the cache and rerank until they are reached.
    let keep = (window_size.unwrap_or(i32::MAX).max(0) as usize).max(anchored);
    if response.event_bundles.len() > keep {
        response.event_bundles.truncate(keep);
        // Held back is still more to read.
        response.page_info.get_or_insert_default().has_next_page = true;
    }

    response.encode_to_vec()
}

/// Where each post sat in the last emission.
fn anchored_positions(previous: Option<&Vec<u8>>) -> HashMap<EventDedupKey, usize> {
    let Some(Ok(previous)) = previous.map(|p| GetFeedResponse::decode(p.as_slice())) else {
        return HashMap::new();
    };
    previous
        .event_bundles
        .iter()
        .enumerate()
        .filter_map(|(position, bundle)| Some((event_dedup_key(bundle)?, position)))
        .collect()
}

/// Merge function for the thread RPC. Blocked posts take their descending
/// replies with them, as they do server-side.
fn merge_thread_responses(
    values: &[Vec<u8>],
    _previous: Option<&Vec<u8>>,
    client: &Arc<Mutex<PolycentricClient>>,
) -> Vec<u8> {
    let mut response = merge_bundle_response::<GetPostThreadResponse>(values, client);

    let blocked = client.lock_recover().blocked_identities();
    retain_unblocked_thread_bundles(&blocked, &mut response.thread);
    retain_unblocked_hints(&blocked, &mut response.event_hints);

    response.encode_to_vec()
}

/// A server missing from the token missed the fan-out it came from;
/// paging it from its top now would insert rows above ones already
/// shown, so it sits out until the next fresh load.
fn server_sits_out(
    backward_token: &Option<String>,
    forward_token: &Option<String>,
    server_url: &str,
) -> bool {
    FakeCursorToken::excludes(backward_token, server_url)
        || FakeCursorToken::excludes(forward_token, server_url)
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
        window_size,
        omit_labels,
    } = args;
    let client = query_client.client().clone();

    let query_fn = move |server_url: String| {
        let identity = identity.clone();
        let omit_labels = omit_labels.clone();
        let client = client.clone();

        let sits_out = server_sits_out(&backward_token, &forward_token, &server_url);
        let (backward_token, backward_offset) =
            FakeCursorToken::extract(&backward_token, &server_url);
        let (forward_token, forward_offset) = FakeCursorToken::extract(&forward_token, &server_url);

        async move {
            if sits_out {
                return Ok(GetFeedResponse::default().encode_to_vec());
            }

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
            client.lock_recover().copy_bundles(response.event_bundles);
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(
        query_key,
        query_fn,
        validated_feed_merge(FeedOrder::CreatedAt, window_size),
        opts,
    ))
}

/// Returns posts attributed to the same target (e.g. all posts about a URL).
pub fn get_attribution_feed(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: GetAttributionFeedArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetAttributionFeedArgs {
        attributed_to,
        limit,
        backward_token,
        forward_token,
        window_size,
        omit_labels,
    } = args;
    let client = query_client.client().clone();

    let query_fn = move |server_url: String| {
        let attributed_to = attributed_to.clone();
        let omit_labels = omit_labels.clone();
        let client = client.clone();

        let sits_out = server_sits_out(&backward_token, &forward_token, &server_url);
        let (backward_token, backward_offset) =
            FakeCursorToken::extract(&backward_token, &server_url);
        let (forward_token, forward_offset) = FakeCursorToken::extract(&forward_token, &server_url);

        async move {
            if sits_out {
                return Ok(GetFeedResponse::default().encode_to_vec());
            }

            let attributed_to = AttributedTo::decode(&attributed_to[..])
                .map_err(|e| format!("decode AttributedTo: {e}"))?;

            let mut response = FeedsServiceClient::new(channel(&server_url).await?)
                .get_attribution_feed(GetAttributionFeedRequest {
                    attributed_to: Some(attributed_to),
                    page_params: Some(PageParams {
                        limit,
                        backward_token,
                        forward_token,
                    }),
                    omit_labels,
                })
                .await
                .map_err(|e| format!("get_attribution_feed [{server_url}]: {e}"))?
                .into_inner();

            prepare_page_info(
                &mut response.page_info,
                &server_url,
                backward_offset,
                forward_offset,
            )?;
            let bytes = response.encode_to_vec();

            copy_hints(&client, response.event_hints);
            client.lock_recover().copy_bundles(response.event_bundles);
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(
        query_key,
        query_fn,
        validated_feed_merge(FeedOrder::CreatedAt, window_size),
        opts,
    ))
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
        sort_by,
        limit,
        backward_token,
        forward_token,
        window_size,
        omit_labels,
    } = args;
    let client = query_client.client().clone();
    let order = sort_by.map_or(FeedOrder::CreatedAt, FeedOrder::from);

    let query_fn = move |server_url: String| {
        let follower_identity = follower_identity.clone();
        let omit_labels = omit_labels.clone();
        let client = client.clone();

        let sits_out = server_sits_out(&backward_token, &forward_token, &server_url);
        let (backward_token, backward_offset) =
            FakeCursorToken::extract(&backward_token, &server_url);
        let (forward_token, forward_offset) = FakeCursorToken::extract(&forward_token, &server_url);

        async move {
            if sits_out {
                return Ok(GetFeedResponse::default().encode_to_vec());
            }

            let mut response = FeedsServiceClient::new(channel(&server_url).await?)
                .get_following_feed(GetFollowingFeedRequest {
                    follower_identity,
                    page_params: Some(PageParams {
                        limit,
                        backward_token,
                        forward_token,
                    }),
                    omit_labels,
                    sort_by: sort_by.map(|s| SortPostsBy::from(s) as i32),
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
            client.lock_recover().copy_bundles(response.event_bundles);
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(
        query_key,
        query_fn,
        validated_feed_merge(order, window_size),
        opts,
    ))
}

/// Returns posts the follower or the identities they follow created, reacted
/// to, reposted, quoted or replied to. Takes the same request as the following
/// feed, so it shares `GetFollowingFeedArgs`.
pub fn get_recommended_feed(
    query_client: &QueryClient<Vec<u8>>,
    query_key: Option<QueryKey>,
    args: GetFollowingFeedArgs,
    opts: Option<QueryOpts>,
) -> Arc<dyn QueryObservable> {
    let GetFollowingFeedArgs {
        follower_identity,
        sort_by,
        limit,
        backward_token,
        forward_token,
        window_size,
        omit_labels,
    } = args;
    let client = query_client.client().clone();
    let order = sort_by.map_or(FeedOrder::CreatedAt, FeedOrder::from);

    let query_fn = move |server_url: String| {
        let follower_identity = follower_identity.clone();
        let omit_labels = omit_labels.clone();
        let client = client.clone();

        let sits_out = server_sits_out(&backward_token, &forward_token, &server_url);
        let (backward_token, backward_offset) =
            FakeCursorToken::extract(&backward_token, &server_url);
        let (forward_token, forward_offset) = FakeCursorToken::extract(&forward_token, &server_url);

        async move {
            if sits_out {
                return Ok(GetFeedResponse::default().encode_to_vec());
            }

            let mut response = FeedsServiceClient::new(channel(&server_url).await?)
                .get_recommended_feed(GetFollowingFeedRequest {
                    follower_identity,
                    page_params: Some(PageParams {
                        limit,
                        backward_token,
                        forward_token,
                    }),
                    omit_labels,
                    sort_by: sort_by.map(|s| SortPostsBy::from(s) as i32),
                })
                .await
                .map_err(|e| format!("get_recommended_feed [{server_url}]: {e}"))?
                .into_inner();

            prepare_page_info(
                &mut response.page_info,
                &server_url,
                backward_offset,
                forward_offset,
            )?;
            let bytes = response.encode_to_vec();

            copy_hints(&client, response.event_hints);
            client.lock_recover().copy_bundles(response.event_bundles);
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(
        query_key,
        query_fn,
        validated_feed_merge(order, window_size),
        opts,
    ))
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
        sort_by,
        limit,
        backward_token,
        forward_token,
        window_size,
        omit_labels,
    } = args;
    let client = query_client.client().clone();
    let order = sort_by.map_or(FeedOrder::CreatedAt, FeedOrder::from);

    let query_fn = move |server_url: String| {
        let identity = identity.clone();
        let omit_labels = omit_labels.clone();
        let client = client.clone();

        let sits_out = server_sits_out(&backward_token, &forward_token, &server_url);
        let (backward_token, backward_offset) =
            FakeCursorToken::extract(&backward_token, &server_url);
        let (forward_token, forward_offset) = FakeCursorToken::extract(&forward_token, &server_url);

        async move {
            if sits_out {
                return Ok(GetFeedResponse::default().encode_to_vec());
            }

            let mut response = FeedsServiceClient::new(channel(&server_url).await?)
                .get_explore_feed(GetExploreFeedRequest {
                    identity: identity.clone(),
                    page_params: Some(PageParams {
                        limit,
                        backward_token,
                        forward_token,
                    }),
                    omit_labels,
                    sort_by: sort_by.map(|s| SortPostsBy::from(s) as i32),
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
            client.lock_recover().copy_bundles(response.event_bundles);
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(
        query_key,
        query_fn,
        validated_feed_merge(order, window_size),
        opts,
    ))
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
    let GetPostThreadArgs {
        event_key,
        limit,
        omit_labels,
    } = args;
    let request = GetPostThreadRequest {
        event_key: Some(event_key.into()),
        limit,
        omit_labels,
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
            client.lock_recover().copy_bundles(response.thread);
            Ok(bytes)
        }
    };

    Arc::new(query_client.fetch(query_key, query_fn, merge_thread_responses, opts))
}

#[cfg(test)]
mod tests {
    use crate::query::event::merge::{bundle_created_at, event_dedup_key};

    use super::*;
    use polycentric_common::models::protos_v2::{
        Event, EventBundle, EventHint, EventKey, EventMetadata, GetFeedResponse, PageInfo,
        PublicKey, SignedEvent,
    };

    fn make_bundle(
        collection: i32,
        identity: &str,
        key_type: i32,
        key: Vec<u8>,
        sequence: u64,
    ) -> EventBundle {
        make_bundle_at(collection, identity, key_type, key, sequence, 0)
    }

    fn make_bundle_at(
        collection: i32,
        identity: &str,
        key_type: i32,
        key: Vec<u8>,
        sequence: u64,
        created_at: u64,
    ) -> EventBundle {
        let event = Event {
            key: Some(EventKey {
                collection,
                identity: identity.to_string(),
                signed_by: Some(PublicKey { key_type, key }),
                sequence,
            }),
            created_at,
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

        let merged = merge_feed_responses(&[prev, new], None, &test_client());
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

        let merged = merge_feed_responses(&[prev, new], None, &test_client());
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

        let merged = merge_feed_responses(&[prev, new], None, &test_client());
        let decoded = GetFeedResponse::decode(merged.as_slice()).unwrap();
        assert_eq!(decoded.event_hints.len(), 1);
    }

    #[test]
    fn merge_handles_no_prior_value() {
        let new = encode_response(vec![make_bundle(2, "a", 1, vec![1], 1)], vec![]);
        let merged = merge_feed_responses(&[new], None, &test_client());
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
        let merged = merge_feed_responses(&[new], None, &test_client());
        // Parseable + both unparseables retained (no dedup key to compare).
        let decoded = GetFeedResponse::decode(merged.as_slice()).unwrap();
        assert_eq!(decoded.event_bundles.len(), 3);
    }

    fn paged_response(server: &str, bundles: Vec<EventBundle>, has_next: bool) -> Vec<u8> {
        GetFeedResponse {
            event_bundles: bundles,
            event_hints: Vec::new(),
            page_info: Some(PageInfo {
                start_cursor: FakeCursorToken::encode_new(server, "start", -1, false).unwrap(),
                end_cursor: FakeCursorToken::encode_new(server, "end", 1, has_next).unwrap(),
                has_previous_page: false,
                has_next_page: has_next,
            }),
        }
        .encode_to_vec()
    }

    fn created_ats(merged: &[u8]) -> Vec<u64> {
        GetFeedResponse::decode(merged)
            .unwrap()
            .event_bundles
            .iter()
            .filter_map(bundle_created_at)
            .collect()
    }

    /// Authoring identity of every bundle, in emitted order.
    fn ids(merged: &[u8]) -> Vec<String> {
        GetFeedResponse::decode(merged)
            .unwrap()
            .event_bundles
            .iter()
            .filter_map(|bundle| {
                let signed = bundle.signed_event.as_ref()?;
                Event::decode(signed.event_bytes.as_slice())
                    .ok()?
                    .key
                    .map(|key| key.identity)
            })
            .collect()
    }

    fn upvotes(merged: &[u8]) -> Vec<u64> {
        GetFeedResponse::decode(merged)
            .unwrap()
            .event_bundles
            .iter()
            .map(bundle_upvote_count)
            .collect()
    }

    fn make_bundle_voted(identity: &str, created_at: u64, upvotes: Option<i32>) -> EventBundle {
        EventBundle {
            meta: upvotes.map(|upvote_count| EventMetadata {
                upvote_count: Some(upvote_count),
                ..Default::default()
            }),
            ..make_bundle_at(2, identity, 1, vec![1], 1, created_at)
        }
    }

    #[test]
    fn top_order_ranks_by_upvotes_not_age() {
        // Ranking and age disagree, so sorting by age would rearrange what
        // the server sent. The unreacted post has no metadata at all.
        let bundles = vec![
            make_bundle_voted("high", 10, Some(9)),
            make_bundle_voted("mid", 50, Some(4)),
            make_bundle_voted("none", 99, None),
        ];
        let response = encode_response(bundles, vec![]);

        let by_top = do_feed_merge(
            std::slice::from_ref(&response),
            None,
            &test_client(),
            false,
            FeedOrder::Upvotes,
            None,
        );
        assert_eq!(upvotes(&by_top), vec![9, 4, 0]);
        assert_eq!(created_ats(&by_top), vec![10, 50, 99]);

        let by_age = do_feed_merge(
            &[response],
            None,
            &test_client(),
            false,
            FeedOrder::CreatedAt,
            None,
        );
        assert_eq!(created_ats(&by_age), vec![99, 50, 10]);
    }

    #[test]
    fn a_later_page_updates_a_count_without_moving_the_row() {
        // Y comes back with a count that outranks X.
        let page1 = encode_response(
            vec![
                make_bundle_voted("x", 10, Some(5)),
                make_bundle_voted("y", 20, Some(4)),
            ],
            vec![],
        );
        let page2 = encode_response(vec![make_bundle_voted("y", 20, Some(9))], vec![]);

        let client = test_client();
        let first = do_feed_merge(
            std::slice::from_ref(&page1),
            None,
            &client,
            false,
            FeedOrder::Upvotes,
            None,
        );
        assert_eq!(ids(&first), ["x", "y"]);

        let pages = [page1, page2];
        let second = do_feed_merge(
            &pages,
            Some(&first),
            &client,
            false,
            FeedOrder::Upvotes,
            None,
        );
        assert_eq!(ids(&second), ["x", "y"]);
        assert_eq!(upvotes(&second), vec![5, 9]);

        // Unanchored, the fresher count would have taken the lead.
        let unanchored = do_feed_merge(&pages, None, &client, false, FeedOrder::Upvotes, None);
        assert_eq!(ids(&unanchored), ["y", "x"]);
    }

    #[test]
    fn paging_never_moves_a_row_the_reader_already_has() {
        let now = now_ms();
        let hour = 3_600_000;
        let client = test_client();

        let a = encode_response(
            vec![
                make_bundle_voted("a-hot", now - 2 * hour, Some(50)),
                make_bundle_voted("a-mid", now - 10 * hour, Some(60)),
                make_bundle_voted("a-low", now - 30 * hour, Some(80)),
            ],
            vec![],
        );
        let first = do_feed_merge(
            std::slice::from_ref(&a),
            None,
            &client,
            false,
            FeedOrder::Upvotes,
            None,
        );
        assert_eq!(ids(&first), ["a-hot", "a-mid", "a-low"]);

        // A second server answers on the next fan-out, outranking everything.
        let b = encode_response(
            vec![make_bundle_voted("b-hot", now - hour, Some(500))],
            vec![],
        );
        let pages = [a, b];
        let unanchored = do_feed_merge(&pages, None, &client, false, FeedOrder::Upvotes, None);
        let second = do_feed_merge(
            &pages,
            Some(&first),
            &client,
            false,
            FeedOrder::Upvotes,
            None,
        );

        assert_eq!(ids(&unanchored), ["b-hot", "a-hot", "a-mid", "a-low"]);
        assert_eq!(ids(&second), ["a-hot", "a-mid", "a-low", "b-hot"]);
    }

    #[test]
    fn only_what_the_client_asked_for_is_emitted() {
        let client = test_client();
        let page = encode_response(
            vec![
                make_bundle_voted("first", 30, Some(9)),
                make_bundle_voted("second", 20, Some(8)),
                make_bundle_voted("third", 10, Some(7)),
            ],
            vec![],
        );

        let merged = do_feed_merge(
            std::slice::from_ref(&page),
            None,
            &client,
            false,
            FeedOrder::Upvotes,
            Some(2),
        );

        assert_eq!(ids(&merged), ["first", "second"]);
        // Rows held back are more to read, whatever the servers' cursors say.
        let page_info = GetFeedResponse::decode(merged.as_slice())
            .unwrap()
            .page_info
            .unwrap();
        assert!(page_info.has_next_page);
    }

    #[test]
    fn a_held_back_row_reranks_until_it_is_reached() {
        // A late post outranks everything unseen, so it leads the next
        // window rather than trailing the pool it arrived in.
        let client = test_client();
        let a = encode_response(
            vec![
                make_bundle_voted("shown", 30, Some(9)),
                make_bundle_voted("waiting", 20, Some(3)),
            ],
            vec![],
        );
        let first = do_feed_merge(
            std::slice::from_ref(&a),
            None,
            &client,
            false,
            FeedOrder::Upvotes,
            Some(1),
        );
        assert_eq!(ids(&first), ["shown"]);

        let b = encode_response(vec![make_bundle_voted("late", 10, Some(8))], vec![]);
        let second = do_feed_merge(
            &[a, b],
            Some(&first),
            &client,
            false,
            FeedOrder::Upvotes,
            Some(3),
        );

        assert_eq!(ids(&second), ["shown", "late", "waiting"]);
    }

    #[test]
    fn a_row_the_merge_drops_does_not_come_back() {
        // Absence means blocked, deleted or unvalidated.
        let first = encode_response(
            vec![
                make_bundle_voted("gone", 10, Some(5)),
                make_bundle_voted("kept", 20, Some(4)),
            ],
            vec![],
        );
        let page = encode_response(vec![make_bundle_voted("kept", 20, Some(4))], vec![]);

        let merged = do_feed_merge(
            std::slice::from_ref(&page),
            Some(&first),
            &test_client(),
            false,
            FeedOrder::Upvotes,
            None,
        );
        assert_eq!(ids(&merged), ["kept"]);
    }

    #[test]
    fn a_refresh_ranks_from_scratch() {
        // Invalidation drops the anchor, so a refresh is free to reorder.
        let merged = encode_response(
            vec![
                make_bundle_voted("low", 10, Some(1)),
                make_bundle_voted("high", 10, Some(9)),
            ],
            vec![],
        );
        let merged = do_feed_merge(
            &[merged],
            None,
            &test_client(),
            false,
            FeedOrder::Upvotes,
            None,
        );
        assert_eq!(ids(&merged), ["high", "low"]);
    }

    #[test]
    fn top_order_decays_counts_by_age() {
        // A fresh post with one vote outranks an old post with two.
        let now = now_ms();
        let two_months_ms = 60 * 24 * 3_600_000;
        let bundles = vec![
            make_bundle_voted("old", now - two_months_ms, Some(2)),
            make_bundle_voted("fresh", now - 5_000, Some(1)),
        ];
        let response = encode_response(bundles, vec![]);

        let merged = do_feed_merge(
            &[response],
            None,
            &test_client(),
            false,
            FeedOrder::Upvotes,
            None,
        );
        assert_eq!(upvotes(&merged), vec![1, 2]);
    }

    #[test]
    fn merged_order_does_not_depend_on_input_order() {
        // created_at breaks count ties regardless of input order.
        let a = encode_response(vec![make_bundle_voted("a", 10, Some(3))], vec![]);
        let b = encode_response(vec![make_bundle_voted("b", 20, Some(3))], vec![]);

        let ab = do_feed_merge(
            &[a.clone(), b.clone()],
            None,
            &test_client(),
            false,
            FeedOrder::Upvotes,
            None,
        );
        let ba = do_feed_merge(
            &[b, a],
            None,
            &test_client(),
            false,
            FeedOrder::Upvotes,
            None,
        );
        assert_eq!(ab, ba);
        assert_eq!(created_ats(&ab), vec![20, 10]);
    }

    #[test]
    fn servers_absent_from_a_token_sit_out() {
        let token = FakeCursorToken::encode_new("server-a", "t", 1, true).unwrap();
        assert!(server_sits_out(&None, &Some(token.clone()), "server-b"));
        assert!(!server_sits_out(&None, &Some(token), "server-a"));
        // Fresh loads have no tokens; every server participates.
        assert!(!server_sits_out(&None, &None, "server-b"));
    }

    #[test]
    fn a_still_paging_server_no_longer_holds_back_another_servers_page() {
        // server-a has more data but has only paged to t=90. The anchor
        // stops b's older posts displacing anything, so they can all emit.
        let a = paged_response(
            "server-a",
            vec![
                make_bundle_at(2, "a1", 1, vec![1], 1, 100),
                make_bundle_at(2, "a2", 1, vec![2], 1, 90),
            ],
            true,
        );
        let b = paged_response(
            "server-b",
            vec![
                make_bundle_at(2, "b1", 1, vec![3], 1, 50),
                make_bundle_at(2, "b2", 1, vec![4], 1, 40),
            ],
            false,
        );

        let merged = merge_feed_responses(&[a, b], None, &test_client());
        assert_eq!(created_ats(&merged), vec![100, 90, 50, 40]);
    }

    #[test]
    fn emits_everything_once_every_server_is_exhausted() {
        let a = paged_response(
            "server-a",
            vec![
                make_bundle_at(2, "a1", 1, vec![1], 1, 100),
                make_bundle_at(2, "a2", 1, vec![2], 1, 90),
            ],
            false,
        );
        let b = paged_response(
            "server-b",
            vec![
                make_bundle_at(2, "b1", 1, vec![3], 1, 50),
                make_bundle_at(2, "b2", 1, vec![4], 1, 40),
            ],
            false,
        );

        let merged = merge_feed_responses(&[a, b], None, &test_client());
        assert_eq!(created_ats(&merged), vec![100, 90, 50, 40]);
    }

    #[test]
    fn same_server_pages_do_not_truncate_each_other() {
        // Per-server accumulation runs through the same merge: an earlier
        // page must not hold back the next page's older items.
        let page1 = paged_response(
            "server-a",
            vec![
                make_bundle_at(2, "a1", 1, vec![1], 1, 100),
                make_bundle_at(2, "a2", 1, vec![2], 1, 90),
            ],
            true,
        );
        let page2 = paged_response(
            "server-a",
            vec![
                make_bundle_at(2, "a3", 1, vec![3], 1, 80),
                make_bundle_at(2, "a4", 1, vec![4], 1, 70),
            ],
            true,
        );

        let merged = merge_feed_responses(&[page1, page2], None, &test_client());
        assert_eq!(created_ats(&merged), vec![100, 90, 80, 70]);
    }
}
