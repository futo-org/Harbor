use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
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

/// Type-erased per-server `query_fn`. Stored on `QueryState` so
/// `retry()` / `invalidate()` can re-spawn the fan-out.
pub type QueryFnBox<T> = Arc<dyn Fn(String) -> QueryFutureBox<T> + Send + Sync + 'static>;

/// Type-erased `merge_fn`. Receives every server's most-recent
/// response and reduces them to a single emitted value.
pub type MergeFn<T> = Arc<dyn Fn(&[T]) -> T + Send + Sync + 'static>;

/// Query keys are an array of strings and assist with caching, retry strategies etc.
pub type QueryKey = Vec<String>;

/// Shared, lockable handle to a single `QueryState`. Multiple
/// subscribers and the fan-out tasks all clone the same `Arc` so
/// they observe the same per-key state.
pub type QueryStateHandle<T> = Arc<Mutex<QueryState<T>>>;

/// Query state per QueryKey
pub struct QueryState<T> {
    /// Each server's most-recent successful response, keyed by
    /// `server_url`. The emitted `data` is `merge_fn(values())` over
    /// this map.
    pub data: HashMap<String, T>,
    pub status: QueryStatus,
    pub subscribers: Vec<Arc<Subscriber<QueryResult<T>>>>,
    /// Per-server tasks still in flight for the current fan-out.
    /// `0` means no fetch is currently running.
    pub pending: usize,
    pub query_fn: QueryFnBox<T>,
    pub merge_fn: MergeFn<T>,
    /// Overrides the fan-out target list. `None` means "use whatever
    /// `client.servers()` returns at fetch time"; `Some(list)` pins
    /// the fan-out to those exact servers (single-server polls land
    /// here with `vec![server_url]`).
    pub servers: Option<Vec<String>>,
}

impl<T> QueryState<T> {
    fn new(query_fn: QueryFnBox<T>, merge_fn: MergeFn<T>, servers: Option<Vec<String>>) -> Self {
        Self {
            data: HashMap::new(),
            status: QueryStatus::Loading,
            subscribers: Vec::new(),
            pending: 0,
            query_fn,
            merge_fn,
            servers,
        }
    }
}

/// Reduce the per-server cache into a single emitted value via
/// `merge_fn`. Returns `None` when no server has responded yet.
fn compute_merged<T: Clone>(s: &QueryState<T>) -> Option<T> {
    if s.data.is_empty() {
        return None;
    }
    let values: Vec<T> = s.data.values().cloned().collect();
    Some((s.merge_fn)(&values))
}

/// Snapshot the live subscribers (pruning closed entries) and emit
/// `result` to each. If `error_msg` is set, also fire `error` after
/// the `next`.
fn emit<T: Clone>(state: &Mutex<QueryState<T>>, result: QueryResult<T>, error_msg: Option<String>) {
    let subscribers: Vec<Arc<Subscriber<QueryResult<T>>>> = {
        let mut s = state.lock().unwrap();
        s.subscribers.retain(|sub| !sub.is_closed());
        s.subscribers.clone()
    };
    for sub in &subscribers {
        if sub.is_closed() {
            continue;
        }
        sub.next(result.clone());
        if let Some(ref msg) = error_msg {
            sub.error(msg.clone());
        }
    }
}

/// Client to fetch, retry, invalidate etc queries.
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
    /// The returned `Observable` never calls `complete()`; subscribers
    /// stay registered until they explicitly `unsubscribe()`.
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
        M: Fn(&[T]) -> T + Send + Sync + 'static,
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

            // Get-or-create the per-key state; overwrite the stored
            // query_fn / merge_fn / servers so the latest caller wins.
            let state = upsert_state(&queries, &query_key, &query_fn, &merge_fn, &servers);

            // Snapshot current state.
            let (cached, in_flight) = {
                let s = state.lock().unwrap();
                (compute_merged(&s), s.pending > 0)
            };

            // Decide whether this subscribe call should initiate a
            // fan-out. Subscribers always register regardless.
            let needs_fetch = !in_flight
                && match fetch_mode {
                    FetchMode::OfflineOnly => false,
                    FetchMode::OfflineFirst => cached.is_none(),
                    FetchMode::Default => true,
                };

            let target_servers = if needs_fetch {
                resolve_servers(&state, &client)
            } else {
                Vec::new()
            };
            let will_fetch = needs_fetch && !target_servers.is_empty();

            subscriber.next(QueryResult {
                data: cached,
                status: if will_fetch || in_flight {
                    QueryStatus::Loading
                } else {
                    QueryStatus::Success
                },
            });

            // Register for future emissions.
            {
                let mut s = state.lock().unwrap();
                s.subscribers.retain(|sub| !sub.is_closed());
                s.subscribers.push(subscriber.clone());
            }

            if will_fetch {
                spawn_fanout(state, target_servers);
            }
        })
    }

    /// Retry a query based on its query key
    pub fn retry(&self, query_key: &QueryKey) {
        self.refresh(query_key, false);
    }

    /// Invalidate the cache of a query
    pub fn invalidate(&self, query_key: &QueryKey) {
        self.refresh(query_key, true);
    }

    /// Refresh a query
    fn refresh(&self, query_key: &QueryKey, clear: bool) {
        let Some(state) = self.queries.lock().unwrap().get(query_key).cloned() else {
            return;
        };

        let snapshot = {
            let mut s = state.lock().unwrap();
            if clear {
                s.data.clear();
            }
            s.status = QueryStatus::Loading;
            QueryResult {
                data: compute_merged(&s),
                status: QueryStatus::Loading,
            }
        };
        emit(&state, snapshot, None);

        if state.lock().unwrap().pending > 0 {
            return;
        }
        let target_servers = resolve_servers(&state, &self.client);
        if target_servers.is_empty() {
            return;
        }
        spawn_fanout(state, target_servers);
    }
}

/// Resolve the target server list for a fan-out: state's override
/// when set, otherwise the client's configured list.
fn resolve_servers<T>(
    state: &Mutex<QueryState<T>>,
    client: &Mutex<PolycentricClient>,
) -> Vec<String> {
    if let Some(ref override_list) = state.lock().unwrap().servers {
        return override_list.clone();
    }
    client.lock().unwrap().servers()
}

fn upsert_state<T>(
    queries: &Mutex<HashMap<QueryKey, QueryStateHandle<T>>>,
    query_key: &QueryKey,
    query_fn: &QueryFnBox<T>,
    merge_fn: &MergeFn<T>,
    servers: &Option<Vec<String>>,
) -> QueryStateHandle<T>
where
    T: Clone + Send + Sync + 'static,
{
    let mut map = queries.lock().unwrap();
    let state = map
        .entry(query_key.clone())
        .or_insert_with(|| {
            Arc::new(Mutex::new(QueryState::new(
                query_fn.clone(),
                merge_fn.clone(),
                servers.clone(),
            )))
        })
        .clone();
    {
        let mut s = state.lock().unwrap();
        s.query_fn = query_fn.clone();
        s.merge_fn = merge_fn.clone();
        s.servers = servers.clone();
    }
    state
}

/// Calls each server asynchronously
fn spawn_fanout<T>(state: QueryStateHandle<T>, servers: Vec<String>)
where
    T: Clone + Send + Sync + 'static,
{
    let query_fn = {
        let mut s = state.lock().unwrap();
        s.pending = servers.len();
        s.status = QueryStatus::Loading;
        s.query_fn.clone()
    };

    for server_url in servers {
        let state = state.clone();
        let query_fn = query_fn.clone();

        spawn(async move {
            let result = query_fn(server_url.clone()).await;

            let (snapshot, error_msg) = {
                let mut s = state.lock().unwrap();
                s.pending = s.pending.saturating_sub(1);

                let error_msg = match result {
                    Ok(value) => {
                        s.data.insert(server_url, value);
                        None
                    }
                    Err(msg) => Some(msg),
                };

                s.status = if s.pending == 0 {
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
                        data: compute_merged(&s),
                        status: s.status,
                    },
                    error_msg,
                )
            };

            emit(&state, snapshot, error_msg);
        });
    }
}
