use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use crate::client::PolycentricClient;
use crate::query::query_observable::{QueryResult, QueryStatus};
use crate::rx::observable::{Observable, Subscriber};

/// Fetch method for the query
#[derive(Clone, Copy, Debug, uniffi::Enum)]
pub enum FetchMode {
    /// Initially return from cache and then query each server in parallel.
    Default,
    /// If cached data is found then it will not attempt to call servers.
    /// If nothing in the cache is returned then it calls each of the servers in parallel.
    OfflineFirst,
    /// Will only ever read from the cached data.
    OfflineOnly,
}

/// Options for the query such as the fetch mode or a list of servers
#[derive(Clone, Debug, Default, uniffi::Record)]
pub struct QueryOpts {
    pub fetch_mode: Option<FetchMode>,
    /// Optional list of servers the query should call. `None` uses
    /// `client.servers()`.
    pub servers: Option<Vec<String>>,
}

#[cfg(target_arch = "wasm32")]
fn spawn<F: std::future::Future<Output = ()> + 'static>(fut: F) {
    wasm_bindgen_futures::spawn_local(fut);
}

/// Lazily-initialized multi-threaded runtime used when the caller
/// thread isn't already inside a tokio context.
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

/// Marker trait that's `Send` on native and vacuous on wasm.
#[cfg(not(target_arch = "wasm32"))]
pub trait MaybeSend: Send {}
#[cfg(not(target_arch = "wasm32"))]
impl<T: Send + ?Sized> MaybeSend for T {}

#[cfg(target_arch = "wasm32")]
pub trait MaybeSend {}
#[cfg(target_arch = "wasm32")]
impl<T: ?Sized> MaybeSend for T {}

/// Type-erased boxed future produced by `QueryFnBox<T>`. `Send` on
/// native (so tokio can spawn it); no `Send` bound on wasm.
#[cfg(not(target_arch = "wasm32"))]
pub type QueryFutureBox<T> = Pin<Box<dyn Future<Output = Result<T, String>> + Send + 'static>>;
#[cfg(target_arch = "wasm32")]
pub type QueryFutureBox<T> = Pin<Box<dyn Future<Output = Result<T, String>> + 'static>>;

/// Type-erased per-server `query_fn`.
pub type QueryFnBox<T> = Arc<dyn Fn(String) -> QueryFutureBox<T> + Send + Sync + 'static>;

/// Type-erased `merge_fn`. Receives every server's most-recent
/// response plus a handle to the local `PolycentricClient` (so
/// validating merges can call `validate_event` without capturing a
/// clone in a closure) and reduces them to a single emitted value.
pub type MergeFn<T> =
    Arc<dyn Fn(&[T], &Arc<Mutex<PolycentricClient>>) -> T + Send + Sync + 'static>;

/// Query keys are an array of strings and assist with caching, retry strategies etc.
pub type QueryKey = Vec<String>;

/// Shared, lockable handle to a single `QueryState`. The data cache
/// is shared across fetches with the same key; fan-out state
/// (subscriber, pending count) is local to each subscribe call.
pub type QueryStateHandle<T> = Arc<Mutex<QueryState<T>>>;

/// Per-key cache of each server's most-recent successful response.
pub struct QueryState<T> {
    /// Each server's most-recent successful response, keyed by
    /// `server_url`.
    pub data: HashMap<String, T>,
}

impl<T> QueryState<T> {
    fn new() -> Self {
        Self {
            data: HashMap::new(),
        }
    }
}

/// Reduce the per-server cache into a single emitted value via
/// `merge_fn`. Returns `None` when no server has responded yet.
fn compute_merged<T: Clone>(
    data: &HashMap<String, T>,
    merge_fn: &MergeFn<T>,
    client: &Arc<Mutex<PolycentricClient>>,
) -> Option<T> {
    if data.is_empty() {
        return None;
    }
    let values: Vec<T> = data.values().cloned().collect();
    Some(merge_fn(&values, client))
}

/// Client to fetch and invalidate queries.
pub struct QueryClient<T> {
    client: Arc<Mutex<PolycentricClient>>,
    queries: Arc<Mutex<HashMap<QueryKey, QueryStateHandle<T>>>>,
}

impl<T> QueryClient<T>
where
    T: Clone + Send + Sync + 'static,
{
    pub fn new(client: Arc<Mutex<PolycentricClient>>) -> Self {
        Self {
            client,
            queries: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Borrow the polycentric client (maybe it should be called something else)
    pub fn client(&self) -> &Arc<Mutex<PolycentricClient>> {
        &self.client
    }

    /// Performs a fetch query.
    ///
    /// Subscribing to the returned Observable runs an independent fan-out
    /// over the resolved server list — there is no shared subscriber
    /// multiplexing. The subscriber receives:
    /// - `next(cached, Loading|Success)` immediately
    /// - `next(merged, Loading|Success|Error)` after each server response
    /// - `error(msg)` for each server that fails to respond
    /// - `complete()` once every server in the fan-out has finished
    pub fn fetch<F, Fut, M>(
        &self,
        query_key: QueryKey,
        query_fn: F,
        merge_fn: M,
        opts: Option<QueryOpts>,
    ) -> Observable<QueryResult<T>>
    where
        F: Fn(String) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<T, String>> + MaybeSend + 'static,
        M: Fn(&[T], &Arc<Mutex<PolycentricClient>>) -> T + Send + Sync + 'static,
    {
        let queries = self.queries.clone();
        let client = self.client.clone();
        let query_fn: QueryFnBox<T> = Arc::new(move |server_url| Box::pin(query_fn(server_url)));
        let merge_fn: MergeFn<T> = Arc::new(merge_fn);
        let fetch_mode = opts
            .as_ref()
            .and_then(|o| o.fetch_mode)
            .unwrap_or(FetchMode::Default);
        let servers = opts.and_then(|o| o.servers);

        Observable::new(move |subscriber| {
            if subscriber.is_closed() {
                return;
            }
            let subscriber = Arc::new(subscriber);

            let state = get_or_create_state(&queries, &query_key);

            let cached = {
                let s = state.lock().unwrap();
                compute_merged(&s.data, &merge_fn, &client)
            };

            let needs_fetch = match fetch_mode {
                FetchMode::OfflineOnly => false,
                FetchMode::OfflineFirst => cached.is_none(),
                FetchMode::Default => true,
            };

            let target_servers = if needs_fetch {
                resolve_servers(servers.as_deref(), &client)
            } else {
                Vec::new()
            };
            let will_fetch = needs_fetch && !target_servers.is_empty();

            if cached.is_some() {
                subscriber.next(QueryResult {
                    data: cached,
                    status: if will_fetch {
                        QueryStatus::Loading
                    } else {
                        QueryStatus::Success
                    },
                });
            }

            if !will_fetch {
                subscriber.complete();
                return;
            }

            spawn_fanout(
                state,
                target_servers,
                query_fn.clone(),
                merge_fn.clone(),
                client.clone(),
                subscriber,
            );
        })
    }

    /// Clear the per-key data cache. No subscribers are notified —
    /// orchestration of in-flight observables lives outside the core.
    pub fn invalidate(&self, query_key: &QueryKey) {
        if let Some(state) = self.queries.lock().unwrap().get(query_key).cloned() {
            state.lock().unwrap().data.clear();
        }
    }
}

/// Resolve the target server list for a fan-out: the caller's
/// override when set, otherwise the client's configured list.
fn resolve_servers(
    override_servers: Option<&[String]>,
    client: &Mutex<PolycentricClient>,
) -> Vec<String> {
    if let Some(list) = override_servers {
        return list.to_vec();
    }
    client.lock().unwrap().servers()
}

fn get_or_create_state<T>(
    queries: &Mutex<HashMap<QueryKey, QueryStateHandle<T>>>,
    query_key: &QueryKey,
) -> QueryStateHandle<T>
where
    T: Send + Sync + 'static,
{
    queries
        .lock()
        .unwrap()
        .entry(query_key.clone())
        .or_insert_with(|| Arc::new(Mutex::new(QueryState::new())))
        .clone()
}

/// Calls each server in parallel and emits onto `subscriber` as
/// responses land. `pending` is local to this fan-out so concurrent
/// subscribes don't interfere with each other.
fn spawn_fanout<T>(
    state: QueryStateHandle<T>,
    servers: Vec<String>,
    query_fn: QueryFnBox<T>,
    merge_fn: MergeFn<T>,
    client: Arc<Mutex<PolycentricClient>>,
    subscriber: Arc<Subscriber<QueryResult<T>>>,
) where
    T: Clone + Send + Sync + 'static,
{
    let pending = Arc::new(AtomicUsize::new(servers.len()));

    for server_url in servers {
        let state = state.clone();
        let query_fn = query_fn.clone();
        let merge_fn = merge_fn.clone();
        let client = client.clone();
        let pending = pending.clone();
        let subscriber = subscriber.clone();

        spawn(async move {
            let result = query_fn(server_url.clone()).await;

            let (snapshot, error_msg, is_last) = {
                let mut s = state.lock().unwrap();
                let remaining = pending.fetch_sub(1, Ordering::SeqCst) - 1;
                let is_last = remaining == 0;

                let error_msg = match result {
                    Ok(value) => {
                        s.data.insert(server_url, value);
                        None
                    }
                    Err(msg) => Some(msg),
                };

                let status = if is_last {
                    if s.data.is_empty() {
                        QueryStatus::Error
                    } else {
                        QueryStatus::Success
                    }
                } else {
                    QueryStatus::Loading
                };

                (
                    QueryResult {
                        data: compute_merged(&s.data, &merge_fn, &client),
                        status,
                    },
                    error_msg,
                    is_last,
                )
            };

            if subscriber.is_closed() {
                return;
            }
            subscriber.next(snapshot);
            if let Some(msg) = error_msg {
                subscriber.error(msg);
            }
            if is_last {
                subscriber.complete();
            }
        });
    }
}
