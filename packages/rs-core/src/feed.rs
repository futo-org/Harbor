
use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use polycentric_common::models::protos_v2::{
    feeds_service_client::FeedsServiceClient, FeedPageParams, GetFeedResponse,
    GetIdentityFeedRequest,
};
use prost::Message;

use crate::client::PolycentricClient;
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

#[cfg(target_arch = "wasm32")]
fn spawn<F: std::future::Future<Output = ()> + 'static>(fut: F) {
    wasm_bindgen_futures::spawn_local(fut);
}

#[cfg(all(not(target_arch = "wasm32"), feature = "native-transport"))]
fn spawn<F: std::future::Future<Output = ()> + Send + 'static>(fut: F) {
    tokio::spawn(fut);
}

/// Marker trait that's `Send` on native and vacuous on wasm. Lets a
/// single generic function express "the future must be `Send` if the
/// platform needs it" without duplicating the function via cfg.
#[cfg(not(target_arch = "wasm32"))]
pub trait MaybeSend: Send {}
#[cfg(not(target_arch = "wasm32"))]
impl<T: Send + ?Sized> MaybeSend for T {}

#[cfg(target_arch = "wasm32")]
pub trait MaybeSend {}
#[cfg(target_arch = "wasm32")]
impl<T: ?Sized> MaybeSend for T {}

/// Foreign-implemented observer for `FeedQueryObservable`. The
/// producer pushes serialized `GetFeedResponse` bytes to `next`, an
/// error message to `error`, and fires `complete` once the stream
/// finishes (success or failure).
#[uniffi::export(with_foreign)]
pub trait FeedObserver: Send + Sync {
    fn next(&self, response_bytes: Vec<u8>);
    fn error(&self, message: String);
    fn complete(&self);
}

/// Uniffi-exposed observable for feed queries — adapts the foreign
/// `FeedObserver` into the generic `Observable<Vec<u8>>` underneath.
#[derive(uniffi::Object)]
pub struct FeedQueryObservable {
    inner: Observable<Vec<u8>>,
}

#[uniffi::export]
impl FeedQueryObservable {
    pub fn subscribe(&self, observer: Arc<dyn FeedObserver>) -> Arc<Subscription> {
        let on_next = observer.clone();
        let on_error = observer.clone();
        let on_complete = observer;
        self.inner.subscribe(
            move |value: Vec<u8>| on_next.next(value),
            move |message| on_error.error(message),
            move || on_complete.complete(),
        )
    }
}

impl FeedQueryObservable {
    pub fn new(inner: Observable<Vec<u8>>) -> Arc<Self> {
        Arc::new(Self { inner })
    }
}

pub struct FeedQuery {
    client: Arc<Mutex<PolycentricClient>>,
    cache: Arc<Mutex<HashMap<String, Vec<u8>>>>,
}

impl FeedQuery {
    pub fn new(client: Arc<Mutex<PolycentricClient>>) -> Self {
        Self {
            client,
            cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Asynchronously calls a query_fn and will return cached data immediatly.
    /// Queries all servers in parallel and merges the results
    fn query<F, Fut, M>(
        &self,
        cache_key: String,
        query_fn: F,
        merge_fn: M,
    ) -> Arc<FeedQueryObservable>
    where
        F: Fn(String) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<Vec<u8>, String>> + MaybeSend + 'static,
        M: Fn(Option<Vec<u8>>, Vec<u8>) -> Vec<u8> + Send + Sync + 'static,
    {
        let cache = self.cache.clone();
        let client = self.client.clone();
        let query_fn = Arc::new(query_fn);
        let merge_fn = Arc::new(merge_fn);

        let observable = Observable::new(move |subscriber| {
            let servers = client.lock().unwrap().servers();

            if servers.is_empty() {
                if !subscriber.is_closed() {
                    subscriber.complete();
                }
                return;
            }

            // Exit out if no longer subscribing
            if subscriber.is_closed() {
                return;
            }

            // Check the cache and emit 
            let cached = cache.lock().unwrap().get(&cache_key).cloned();
            if let Some(bytes) = cached {
                subscriber.next(bytes);
            }

            let subscriber = Arc::new(subscriber);
            let pending = Arc::new(AtomicUsize::new(servers.len()));

            // Call the query_fn for each of the servers
            for server_url in servers {
                let cache = cache.clone();
                let cache_key = cache_key.clone();
                let query_fn = query_fn.clone();
                let merge_fn = merge_fn.clone();
                let subscriber = subscriber.clone();
                let pending = pending.clone();

                spawn(async move {
                    if !subscriber.is_closed() {
                        match query_fn(server_url).await {
                            Ok(bytes) => {
                                let prev = cache.lock().unwrap().get(&cache_key).cloned();
                                let merged = merge_fn(prev, bytes);
                                // Save after merge_fn produces the new cache value.
                                cache
                                    .lock()
                                    .unwrap()
                                    .insert(cache_key.clone(), merged.clone());
                                if !subscriber.is_closed() {
                                    subscriber.next(merged);
                                }
                            }
                            Err(message) => {
                                if !subscriber.is_closed() {
                                    subscriber.error(message);
                                }
                            }
                        }
                    }

                    if pending.fetch_sub(1, Ordering::SeqCst) == 1
                        && !subscriber.is_closed()
                    {
                        subscriber.complete();
                    }
                });
            }
        });
        FeedQueryObservable::new(observable)
    }

    /// Return posts for an identity. Goes through `query`, which fans
    /// out per server and emits each response as soon as it arrives.
    pub fn get_identity_feed(
        &self,
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

        let merge_fn = |prev: Option<Vec<u8>>, new: Vec<u8>| {
            let mut merged = prev
                .as_deref()
                .and_then(|b| GetFeedResponse::decode(b).ok())
                .unwrap_or_default();
            if let Ok(incoming) = GetFeedResponse::decode(new.as_slice()) {
                merged.event_bundles.extend(incoming.event_bundles);
                merged.event_hints.extend(incoming.event_hints);
            }
            merged.encode_to_vec()
        };

        self.query(cache_key, query_fn, merge_fn)
    }

}

