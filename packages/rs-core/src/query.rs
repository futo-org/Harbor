use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use crate::client::PolycentricClient;
use crate::rx::observable::Observable;

#[derive(Clone, Debug, uniffi::Enum)]
pub enum QueryStatus {
    Loading,
    Success,
    Error,
}

#[derive(Clone)]
pub struct QueryResult<T> {
    pub data: Option<T>,
    pub status: QueryStatus,
}

#[cfg(target_arch = "wasm32")]
fn spawn<F: std::future::Future<Output = ()> + 'static>(fut: F) {
    wasm_bindgen_futures::spawn_local(fut);
}

/// Lazily-initialized multi-threaded runtime used when the caller
/// thread isn't already inside a tokio context (e.g. a JNI thread on
/// Android).
#[cfg(all(not(target_arch = "wasm32"), feature = "native-transport"))]
fn fallback_runtime() -> &'static tokio::runtime::Runtime {
    use std::sync::OnceLock;
    static RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    RUNTIME.get_or_init(|| {
        tokio::runtime::Runtime::new().expect("failed to build fallback tokio runtime")
    })
}

#[cfg(all(not(target_arch = "wasm32"), feature = "native-transport"))]
fn spawn<F: std::future::Future<Output = ()> + Send + 'static>(fut: F) {
    match tokio::runtime::Handle::try_current() {
        Ok(handle) => {
            handle.spawn(fut);
        }
        Err(_) => {
            fallback_runtime().spawn(fut);
        }
    }
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

/// Shared query primitive. Holds a reference to the polycentric
/// client (for the server list) and a merged-response cache keyed by
/// `cache_key`. One `Query<T>` per payload type T.
pub struct Query<T> {
    client: Arc<Mutex<PolycentricClient>>,
    cache: Arc<Mutex<HashMap<String, T>>>,
}

impl<T> Query<T>
where
    T: Clone + Send + Sync + 'static,
{
    pub fn new(client: Arc<Mutex<PolycentricClient>>) -> Self {
        Self {
            client,
            cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Asynchronously calls `query_fn` for every configured server in
    /// parallel and merges each response into the cache. Returns an
    /// `Observable<T>` — on subscribe it replays the cached merged
    /// value (if any) and then emits progressively as each per-server
    /// response arrives.
    pub fn query<F, Fut, M>(
        &self,
        cache_key: String,
        query_fn: F,
        merge_fn: M,
    ) -> Observable<QueryResult<T>>
    where
        F: Fn(String) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<T, String>> + MaybeSend + 'static,
        M: Fn(Option<T>, T) -> T + Send + Sync + 'static,
    {
        let cache = self.cache.clone();
        let client = self.client.clone();
        let query_fn = Arc::new(query_fn);
        let merge_fn = Arc::new(merge_fn);

        Observable::new(move |subscriber| {
            let servers = client.lock().unwrap().servers();

            if servers.is_empty() {
                if !subscriber.is_closed() {
                    subscriber.complete();
                }
                return;
            }

            if subscriber.is_closed() {
                return;
            }

            // Emit the cached value (if any) with `Loading`; per-server
            // fetches are now in flight.
            let cached = cache.lock().unwrap().get(&cache_key).cloned();
            subscriber.next(QueryResult {
                data: cached,
                status: QueryStatus::Loading,
            });

            let subscriber = Arc::new(subscriber);

            // Keep track of inflight requests
            let pending = Arc::new(AtomicUsize::new(servers.len()));

            for server_url in servers {
                let cache = cache.clone();
                let cache_key = cache_key.clone();
                let query_fn = query_fn.clone();
                let merge_fn = merge_fn.clone();
                let subscriber = subscriber.clone();
                let pending = pending.clone();

                spawn(async move {
                    if subscriber.is_closed() {
                        return;
                    }
                    match query_fn(server_url).await {
                        Ok(value) => {
                            let prev = cache.lock().unwrap().get(&cache_key).cloned();
                            let merged = merge_fn(prev, value);
                            cache
                                .lock()
                                .unwrap()
                                .insert(cache_key.clone(), merged.clone());
                            let remaining = pending.fetch_sub(1, Ordering::AcqRel) - 1;
                            let status = if remaining == 0 {
                                QueryStatus::Success
                            } else {
                                QueryStatus::Loading
                            };
                            if !subscriber.is_closed() {
                                subscriber.next(QueryResult {
                                    data: Some(merged),
                                    status,
                                });
                            }
                        }
                        Err(message) => {
                            pending.fetch_sub(1, Ordering::AcqRel);
                            let last = cache.lock().unwrap().get(&cache_key).cloned();
                            if !subscriber.is_closed() {
                                subscriber.next(QueryResult {
                                    data: last,
                                    status: QueryStatus::Error,
                                });
                                subscriber.error(message);
                            }
                        }
                    }
                });
            }
        })
    }
}
