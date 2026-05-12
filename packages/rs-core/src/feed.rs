//! Feed-service RPCs surfaced as observables via `Query`.

use std::collections::HashSet;
use std::sync::Arc;

use polycentric_common::models::protos_v2::{
    feeds_service_client::FeedsServiceClient, Event, EventBundle, FeedPageParams,
    GetExploreFeedRequest, GetFeedResponse, GetFollowingFeedRequest, GetIdentityFeedRequest,
};
use prost::Message;

use crate::query::{Query, QueryResult, QueryStatus};
use crate::rx::observable::Observable;
use crate::rx::subscription::Subscription;

#[cfg(target_arch = "wasm32")]
type GrpcChannel = tonic_web_wasm_client::Client;
#[cfg(all(not(target_arch = "wasm32"), feature = "native-transport"))]
type GrpcChannel = tonic::transport::Channel;

#[cfg(target_arch = "wasm32")]
fn make_channel(server_url: &str) -> Result<GrpcChannel, String> {
    Ok(tonic_web_wasm_client::Client::new(server_url.to_string()))
}

#[cfg(all(not(target_arch = "wasm32"), feature = "native-transport"))]
fn make_channel(server_url: &str) -> Result<GrpcChannel, String> {
    let mut endpoint = tonic::transport::Channel::from_shared(server_url.to_string())
        .map_err(|e| format!("Invalid server url: {e}"))?;
    if server_url.starts_with("https://") {
        let tls = tonic::transport::ClientTlsConfig::new().with_webpki_roots();
        endpoint = endpoint
            .tls_config(tls)
            .map_err(|e| format!("TLS config: {e}"))?;
    }
    Ok(endpoint.connect_lazy())
}

/// FFI-friendly mirror of `QueryResult<Vec<u8>>` for the feed RPCs.
#[derive(uniffi::Record)]
pub struct FeedQueryResult {
    pub data: Option<Vec<u8>>,
    pub status: QueryStatus,
}

/// Foreign-implemented observer for `FeedQueryObservable`. `next`
/// receives the full `FeedQueryResult` so the consumer sees both the
/// merged response bytes and the current loading status.
#[uniffi::export(with_foreign)]
pub trait FeedObserver: Send + Sync {
    fn next(&self, result: FeedQueryResult);
    fn error(&self, message: String);
    fn complete(&self);
}

/// FFI wrapper around the generic `Observable<QueryResult<Vec<u8>>>`
/// returned by `Query::query` for feed RPCs.
#[derive(uniffi::Object)]
pub struct FeedQueryObservable {
    inner: Observable<QueryResult<Vec<u8>>>,
}

#[uniffi::export]
impl FeedQueryObservable {
    pub fn subscribe(&self, observer: Arc<dyn FeedObserver>) -> Arc<Subscription> {
        let next = observer.clone();
        let error = observer.clone();
        let complete = observer;
        self.inner.subscribe(
            move |result: QueryResult<Vec<u8>>| {
                next.next(FeedQueryResult {
                    data: result.data,
                    status: result.status,
                });
            },
            move |message| error.error(message),
            move || complete.complete(),
        )
    }
}

impl FeedQueryObservable {
    pub fn new(inner: Observable<QueryResult<Vec<u8>>>) -> Arc<Self> {
        Arc::new(Self { inner })
    }
}

type EventDedupKey = (i32, String, i32, Vec<u8>, u64);

fn event_dedup_key(bundle: &EventBundle) -> Option<EventDedupKey> {
    let signed = bundle.signed_event.as_ref()?;
    let event = Event::decode(signed.event_bytes.as_slice()).ok()?;
    let key = event.key?;
    let signed_by = key.signed_by?;
    Some((
        key.collection,
        key.identity,
        signed_by.key_type,
        signed_by.key,
        key.sequence,
    ))
}

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

/// Return posts for an identity.
pub fn get_identity_feed(
    query: &Query<Vec<u8>>,
    identity: String,
    limit: Option<i32>,
    before_token: Option<String>,
    after_token: Option<String>,
) -> Arc<FeedQueryObservable> {
    let cache_key = format!(
        "identity_feed:{identity}:limit={limit:?}:before={before_token:?}:after={after_token:?}"
    );

    let query_fn = move |server_url: String| {
        let identity = identity.clone();
        let before_token = before_token.clone();
        let after_token = after_token.clone();
        async move {
            let channel = make_channel(&server_url)?;
            let response = FeedsServiceClient::new(channel)
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
            Ok(response.encode_to_vec())
        }
    };

    FeedQueryObservable::new(query.query(cache_key, query_fn, merge_feed_responses))
}

/// Returns posts an identity is following
pub fn get_following_feed(
    query: &Query<Vec<u8>>,
    follower_identity: String,
    limit: Option<i32>,
    before_token: Option<String>,
    after_token: Option<String>,
) -> Arc<FeedQueryObservable> {
    let cache_key = format!(
        "following_feed:{follower_identity}:limit={limit:?}:before={before_token:?}:after={after_token:?}"
    );

    let query_fn = move |server_url: String| {
        let follower_identity = follower_identity.clone();
        let before_token: Option<String> = before_token.clone();
        let after_token = after_token.clone();
        async move {
            let channel = make_channel(&server_url)?;
            let response = FeedsServiceClient::new(channel)
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
            Ok(response.encode_to_vec())
        }
    };

    FeedQueryObservable::new(query.query(cache_key, query_fn, merge_feed_responses))
}

/// Server-curated explore feed of posts relevant to `identity`.
pub fn get_explore_feed(
    query: &Query<Vec<u8>>,
    identity: Option<String>,
    limit: Option<i32>,
    before_token: Option<String>,
    after_token: Option<String>,
) -> Arc<FeedQueryObservable> {
    let cache_key = format!(
        "explore_feed:{identity:?}:limit={limit:?}:before={before_token:?}:after={after_token:?}"
    );

    let query_fn = move |server_url: String| {
        let identity = identity.clone();
        let before_token = before_token.clone();
        let after_token = after_token.clone();
        async move {
            let channel = make_channel(&server_url)?;
            let response = FeedsServiceClient::new(channel)
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
            Ok(response.encode_to_vec())
        }
    };

    FeedQueryObservable::new(query.query(cache_key, query_fn, merge_feed_responses))
}
