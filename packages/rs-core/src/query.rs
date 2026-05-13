use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use crate::client::PolycentricClient;
use crate::rx::observable::Observable;
use crate::rx::subscription::Subscription;

#[derive(Clone, Debug, uniffi::Enum)]
pub enum QueryStatus {
    Loading,
    Success,
    Error,
}

/// How `Query::query` should reconcile its in-memory merged-response
/// cache with the network. Generic across every RPC built on `Query`.
#[derive(Clone, Copy, Debug, uniffi::Enum)]
pub enum FetchMode {
    /// Emit the cached value (if any) as `Loading`, fan out to every
    /// configured server, and emit progressively as responses arrive.
    /// Completes once every server has reported.
    Default,
    /// If a cached value exists for this cache key, emit it once as
    /// `Success` and complete without touching the network. Falls back
    /// to `Default` when nothing is cached.
    OfflineFirst,
    /// Emit whatever's locally available — cached value or `None` —
    /// as `Success` and complete. Never goes to the network even when
    /// nothing is cached.
    OfflineOnly,
}

#[derive(Clone)]
pub struct QueryResult<T> {
    pub data: Option<T>,
    pub status: QueryStatus,
}

/// Convert a query payload into the FFI-facing `Vec<u8>` representation
/// used by `QueryObservable` emissions. Lets the `QueryObservable`
/// blanket impl below cover any `Observable<QueryResult<T>>` whose `T`
/// can produce bytes — typically already-encoded proto bytes.
pub trait ToFfiBytes {
    fn to_ffi_bytes(&self) -> Vec<u8>;
}

impl ToFfiBytes for Vec<u8> {
    fn to_ffi_bytes(&self) -> Vec<u8> {
        self.clone()
    }
}

/// FFI-friendly mirror of `QueryResult<T>` after `T` has been converted
/// to bytes. Carried on every `QueryObservable` emission.
#[derive(uniffi::Record)]
pub struct QueryResultFfi {
    pub data: Option<Vec<u8>>,
    pub status: QueryStatus,
}

/// Foreign-implemented observer for `QueryObservable`.
#[uniffi::export(with_foreign)]
pub trait QueryObserver: Send + Sync {
    fn next(&self, result: QueryResultFfi);
    fn error(&self, message: String);
    fn complete(&self);
}

/// FFI-exposed trait. Every `Observable<QueryResult<T>>` whose `T:
/// ToFfiBytes` implements this via the blanket impl below — so any
/// RPC built on `Query::query` can be returned as `Arc<dyn
/// QueryObservable>` without a per-RPC wrapper type.
#[uniffi::export]
pub trait QueryObservable: Send + Sync {
    fn subscribe(&self, observer: Arc<dyn QueryObserver>) -> Arc<Subscription>;
}

impl<T> QueryObservable for Observable<QueryResult<T>>
where
    T: ToFfiBytes + Clone + Send + Sync + 'static,
{
    fn subscribe(&self, observer: Arc<dyn QueryObserver>) -> Arc<Subscription> {
        let next = observer.clone();
        let error = observer.clone();
        let complete = observer;
        Observable::subscribe(
            self,
            move |result: QueryResult<T>| {
                next.next(QueryResultFfi {
                    data: result.data.as_ref().map(ToFfiBytes::to_ffi_bytes),
                    status: result.status,
                });
            },
            move |message| error.error(message),
            move || complete.complete(),
        )
    }
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

    /// Borrow the underlying client. Sync use sites can call this and
    /// `.lock()` directly without cloning the `Arc`; closure-capture
    /// sites should `.clone()` the returned `Arc` explicitly.
    pub fn client(&self) -> &Arc<Mutex<PolycentricClient>> {
        &self.client
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
        merge_fn: Option<M>,
        fetch_mode: Option<FetchMode>,
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
        let fetch_mode = fetch_mode.unwrap_or(FetchMode::Default);

        Observable::new(move |subscriber| {
            if subscriber.is_closed() {
                return;
            }

            let cached = cache.lock().unwrap().get(&cache_key).cloned();
            let short_circuit = matches!(fetch_mode, FetchMode::OfflineOnly)
                || (matches!(fetch_mode, FetchMode::OfflineFirst) && cached.is_some());

            subscriber.next(QueryResult {
                data: cached,
                status: if short_circuit {
                    QueryStatus::Success
                } else {
                    QueryStatus::Loading
                },
            });

            if short_circuit {
                subscriber.complete();
                return;
            }

            let servers = client.lock().unwrap().servers();
            if servers.is_empty() {
                subscriber.complete();
                return;
            }

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
                            let merged = match merge_fn.as_ref() {
                                Some(f) => f(prev, value),
                                None => value,
                            };
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
                                if remaining == 0 {
                                    subscriber.complete();
                                }
                            }
                        }
                        Err(message) => {
                            let remaining = pending.fetch_sub(1, Ordering::AcqRel) - 1;
                            let last = cache.lock().unwrap().get(&cache_key).cloned();
                            if !subscriber.is_closed() {
                                subscriber.next(QueryResult {
                                    data: last,
                                    status: QueryStatus::Error,
                                });
                                subscriber.error(message);
                                if remaining == 0 {
                                    subscriber.complete();
                                }
                            }
                        }
                    }
                });
            }
        })
    }
}
