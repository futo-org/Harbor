use std::cmp::max;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures::future::{Either, select};
use futures_timer::Delay;

use crate::client::PolycentricClient;
use crate::logging::log_warn;
use crate::query::query_observable::{QueryResult, QueryStatus};
use crate::rx::observable::{Observable, Subscriber};

/// Per-server timeout applied when `QueryOpts.server_timeout_ms` is unset.
const DEFAULT_SERVER_TIMEOUT_MS: u32 = 5_000;

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

/// Specifies how cached data and newly fetched data should be handled
/// after fetching.
#[derive(Clone, Copy, Default, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum UpdateMode {
    /// Data we fetched from the remote replaces any cached data.
    #[default]
    Replace,
    /// Data we fetched from the remote is merged with any cached data.
    Merge,
}

/// Specifies when merged data is emitted during a fan-out.
#[derive(Clone, Copy, Default, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum EmitMode {
    /// Emit once every server has responded or timed out. Cached data
    /// still emits up front.
    #[default]
    Default,
    /// Emit progressively as each server's response arrives.
    Eager,
}

/// Options for the query such as the fetch mode or a list of servers
#[derive(Clone, Debug, Default, uniffi::Record)]
pub struct QueryOpts {
    pub fetch_mode: Option<FetchMode>,
    pub update_mode: Option<UpdateMode>,
    /// Optional list of servers the query should call. `None` uses
    /// `client.servers()`.
    pub servers: Option<Vec<String>>,
    pub emit_mode: Option<EmitMode>,
    /// How long to wait for each server before treating it as errored,
    /// in milliseconds. Defaults to 5000. Timeouts surface as `error`
    /// emissions prefixed with `timeout [server]`.
    pub server_timeout_ms: Option<u32>,
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

/// Contains all of the per-server info we need in the query state.
pub struct QueryResponseInfo<T> {
    response: T,
    epoch: u64,
}

impl<T> QueryResponseInfo<T> {
    /// Update this server's state info with newly received data.
    pub fn update(
        mut self,
        response: T,
        epoch: u64,
        merge_fn: &MergeFn<T>,
        client: &Arc<Mutex<PolycentricClient>>,
        update_mode: UpdateMode,
    ) -> Self {
        match update_mode {
            UpdateMode::Replace => {
                // Only replace with responses from a newer fan-out
                if self.epoch >= epoch {
                    return self;
                }

                self.response = response;
                self.epoch = epoch;
            }
            UpdateMode::Merge => {
                self.response = merge_fn(&[self.response, response], client);
                self.epoch = max(self.epoch, epoch);
            }
        }

        self
    }
}

/// Per-key cache of each server's most-recent successful response.
pub struct QueryState<T> {
    /// Each server's most-recent successful response, keyed by
    /// `server_url`.
    pub data: HashMap<String, QueryResponseInfo<T>>,

    /// Incrementing integer for each fan-out for this state instance.
    /// Prevents a slow server from overriding data from a newer fan-out
    /// with a response that arrives really late.
    pub epoch: u64,

    /// The epoch of the latest fan-out with a `Replace` update mode.
    /// We discard a merge response if its epoch is from before this one.
    pub latest_replace_epoch: u64,
}

impl<T> Default for QueryState<T> {
    /// Empty query state with no ongoing fan-out.
    fn default() -> Self {
        Self {
            data: HashMap::new(),
            epoch: 0,
            latest_replace_epoch: 0,
        }
    }
}

impl<T> QueryState<T> {
    pub fn new() -> Self {
        Self::default()
    }

    /// Start a new fan-out epoch.
    pub fn next_fanout(&mut self, update_mode: UpdateMode) -> u64 {
        self.epoch += 1;

        if update_mode == UpdateMode::Replace {
            self.latest_replace_epoch = self.epoch;
        }

        self.epoch
    }

    /// Update the query state with new newly received data.
    pub fn update(
        &mut self,
        server: &str,
        value: T,
        epoch: u64,
        merge_fn: &MergeFn<T>,
        client: &Arc<Mutex<PolycentricClient>>,
        update_mode: UpdateMode,
    ) {
        // Doing a replace fan-out means we want to discard any data from before.
        // Don't even merge data if a replace fan-out has started after this data
        // was requested.
        if update_mode == UpdateMode::Merge && self.latest_replace_epoch > epoch {
            return;
        }

        if let Some((server, mut info)) = self.data.remove_entry(server) {
            info = info.update(value, epoch, merge_fn, client, update_mode);
            self.data.insert(server, info);
        } else {
            self.data.insert(
                server.to_string(),
                QueryResponseInfo {
                    response: value,
                    epoch,
                },
            );
        }
    }

    /// Derive the query status from the current state data.
    pub fn status(&self, pending: usize) -> QueryStatus {
        match (pending == 0, self.data.is_empty()) {
            (true, true) => QueryStatus::Error,
            (true, false) => QueryStatus::Success,
            (false, _) => QueryStatus::Loading,
        }
    }
}

/// Reduce the per-server cache into a single emitted value via
/// `merge_fn`. Returns `None` when no server has responded yet.
fn compute_merged<T: Clone>(
    data: &HashMap<String, QueryResponseInfo<T>>,
    merge_fn: &MergeFn<T>,
    client: &Arc<Mutex<PolycentricClient>>,
) -> Option<T> {
    if data.is_empty() {
        return None;
    }

    // Merge in a fixed server order; HashMap iteration order is arbitrary.
    let mut entries: Vec<(&String, &QueryResponseInfo<T>)> = data.iter().collect();
    entries.sort_unstable_by_key(|(a, _)| *a);
    let values: Vec<T> = entries
        .into_iter()
        .map(|(_, info)| info.response.clone())
        .collect();

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
        query_key: Option<QueryKey>,
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
        let update_mode = opts
            .as_ref()
            .and_then(|opts| opts.update_mode)
            .unwrap_or_default();
        let emit_mode = opts.as_ref().and_then(|o| o.emit_mode).unwrap_or_default();
        let server_timeout = Duration::from_millis(
            opts.as_ref()
                .and_then(|o| o.server_timeout_ms)
                .unwrap_or(DEFAULT_SERVER_TIMEOUT_MS) as u64,
        );
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
                    successful_servers: 0,
                    pending_servers: if will_fetch { target_servers.len() } else { 0 },
                });
            }

            if !will_fetch {
                subscriber.complete();
                return;
            }

            spawn_fanout(
                state,
                target_servers,
                update_mode,
                emit_mode,
                server_timeout,
                query_fn.clone(),
                merge_fn.clone(),
                client.clone(),
                subscriber,
            );
        })
    }

    /// Clear the data cache of every key under `prefix`, which is a key
    /// partition: `["feed"]` clears `["feed", "explore", …]` too.
    pub fn invalidate(&self, prefix: &QueryKey) {
        for (key, state) in self.queries.lock().unwrap().iter() {
            if !key.starts_with(prefix) {
                continue;
            }
            let mut state = state.lock().unwrap();

            // Clear cached server responses
            state.data.clear();

            // Create a dummy replace epoch so that any pending merge requests have
            // their responses discarded.
            state.next_fanout(UpdateMode::Replace);
        }
    }

    /// Clear the data cache of every query key. No subscribers are
    /// notified — orchestration of in-flight observables lives outside
    /// the core.
    pub fn invalidate_all(&self) {
        for state in self.queries.lock().unwrap().values() {
            let mut state = state.lock().unwrap();
            state.data.clear();
            state.next_fanout(UpdateMode::Replace);
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
    query_key: &Option<QueryKey>,
) -> QueryStateHandle<T>
where
    T: Send + Sync + 'static,
{
    let make_new_state = || Arc::new(Mutex::new(QueryState::new()));

    if let Some(query_key) = query_key {
        queries
            .lock()
            .unwrap()
            .entry(query_key.clone())
            .or_insert_with(make_new_state)
            .clone()
    } else {
        make_new_state()
    }
}

/// Calls each server in parallel and emits onto `subscriber` as
/// responses land. `pending` is local to this fan-out so concurrent
/// subscribes don't interfere with each other.
#[allow(clippy::too_many_arguments)]
fn spawn_fanout<T>(
    state: QueryStateHandle<T>,
    servers: Vec<String>,
    update_mode: UpdateMode,
    emit_mode: EmitMode,
    server_timeout: Duration,
    query_fn: QueryFnBox<T>,
    merge_fn: MergeFn<T>,
    client: Arc<Mutex<PolycentricClient>>,
    subscriber: Arc<Subscriber<QueryResult<T>>>,
) where
    T: Clone + Send + Sync + 'static,
{
    // Initialize fan-out state
    let epoch = {
        let mut state = state.lock().unwrap();
        state.next_fanout(update_mode)
    };

    let pending = Arc::new(AtomicUsize::new(servers.len()));
    let successful = Arc::new(AtomicUsize::new(0));

    for server_url in servers {
        // Copy any state we need for each server's query task
        let state = state.clone();
        let query_fn = query_fn.clone();
        let merge_fn = merge_fn.clone();
        let client = client.clone();
        let pending = pending.clone();
        let successful = successful.clone();
        let subscriber = subscriber.clone();

        spawn(async move {
            // Drop (cancel) the query if the server doesn't respond in time.
            let result =
                match select(query_fn(server_url.clone()), Delay::new(server_timeout)).await {
                    Either::Left((result, _)) => result,
                    Either::Right(_) => {
                        let msg = format!(
                            "timeout [{server_url}]: no response within {}ms",
                            server_timeout.as_millis()
                        );
                        log_warn(|| msg.clone());
                        Err(msg)
                    }
                };

            // Lock the query state mutex and do what we need with it
            let (snapshot, error_msg, is_last) = {
                let mut s = state.lock().unwrap();

                // Update state
                let pending_servers = pending.fetch_sub(1, Ordering::SeqCst) - 1;

                let successful_servers = if result.is_ok() {
                    successful.fetch_add(1, Ordering::SeqCst) + 1
                } else {
                    successful.load(Ordering::SeqCst)
                };

                let error_msg = match result {
                    Ok(value) => {
                        s.update(&server_url, value, epoch, &merge_fn, &client, update_mode);
                        None
                    }
                    Err(msg) => Some(msg),
                };

                // Gather results
                let is_last = pending_servers == 0;

                // The default emit mode publishes only the settled result,
                // so skip intermediate merges entirely.
                let snapshot = if emit_mode == EmitMode::Default && !is_last {
                    None
                } else {
                    Some(QueryResult {
                        data: compute_merged(&s.data, &merge_fn, &client),
                        status: s.status(pending_servers),
                        successful_servers,
                        pending_servers,
                    })
                };

                (snapshot, error_msg, is_last)
            };

            // Publish results
            if subscriber.is_closed() {
                return;
            }
            if let Some(snapshot) = snapshot {
                subscriber.next(snapshot);
            }
            if let Some(msg) = error_msg {
                subscriber.error(msg);
            }
            if is_last {
                subscriber.complete();
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    enum Ev {
        Next(Vec<u8>),
        Complete,
    }

    /// Parse comma-joined numbers from every response, dedup, and re-join.
    fn merge_join(values: &[Vec<u8>], _client: &Arc<Mutex<PolycentricClient>>) -> Vec<u8> {
        let mut items: Vec<u32> = values
            .iter()
            .flat_map(|v| {
                String::from_utf8_lossy(v)
                    .split(',')
                    .filter(|s| !s.is_empty())
                    .map(|s| s.parse::<u32>().unwrap())
                    .collect::<Vec<_>>()
            })
            .collect();
        items.sort_unstable();
        items.dedup();
        items
            .iter()
            .map(u32::to_string)
            .collect::<Vec<_>>()
            .join(",")
            .into_bytes()
    }

    /// Run one fan-out for `key` where every server responds with
    /// `response`, and collect the emitted data until completion.
    async fn run_fanout(
        qc: &QueryClient<Vec<u8>>,
        key: &QueryKey,
        response: &'static str,
    ) -> Vec<String> {
        let opts = QueryOpts {
            update_mode: Some(UpdateMode::Merge),
            ..Default::default()
        };
        let obs = qc.fetch(
            Some(key.clone()),
            move |_server| async move { Ok(response.as_bytes().to_vec()) },
            merge_join,
            Some(opts),
        );

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let tx_complete = tx.clone();
        let _sub = obs.subscribe(
            move |r: QueryResult<Vec<u8>>| {
                let _ = tx.send(Ev::Next(r.data.unwrap_or_default()));
            },
            |_e| {},
            move || {
                let _ = tx_complete.send(Ev::Complete);
            },
        );

        let mut out = Vec::new();
        while let Some(ev) = rx.recv().await {
            match ev {
                Ev::Next(d) => out.push(String::from_utf8_lossy(&d).into_owned()),
                Ev::Complete => break,
            }
        }
        out
    }

    #[tokio::test]
    async fn merge_fanouts_accumulate_batches() {
        let client = Arc::new(Mutex::new(PolycentricClient::new()));
        client.lock().unwrap().set_servers(vec!["s1".to_string()]);
        let qc: QueryClient<Vec<u8>> = QueryClient::new(client);
        let key: QueryKey = vec!["feed".to_string()];

        let first = run_fanout(&qc, &key, "1,2").await;
        assert_eq!(first.last().map(String::as_str), Some("1,2"));

        let second = run_fanout(&qc, &key, "3,4").await;
        assert_eq!(
            second.first().map(String::as_str),
            Some("1,2"),
            "extend should emit the cached history up front"
        );
        assert_eq!(
            second.last().map(String::as_str),
            Some("1,2,3,4"),
            "the new batch should merge into the history"
        );
    }
}
