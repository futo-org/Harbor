use futures::FutureExt;
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
use crate::lock::LockRecover;
use crate::logging::{log_error, log_warn, panic_payload_message};
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
fn spawn<F: Future<Output = ()> + 'static>(fut: F) -> bool {
    wasm_bindgen_futures::spawn_local(fut);
    true
}

/// Lazily-initialized single-worker runtime used when the caller thread
/// isn't already inside a tokio context. `None` if the runtime could not
/// be built (thread or I/O driver creation failed).
#[cfg(all(not(target_arch = "wasm32"), feature = "native-transport"))]
fn fallback_runtime() -> Option<&'static tokio::runtime::Runtime> {
    use std::sync::OnceLock;
    static RUNTIME: OnceLock<Option<tokio::runtime::Runtime>> = OnceLock::new();
    RUNTIME
        .get_or_init(|| {
            tokio::runtime::Builder::new_multi_thread()
                .worker_threads(1)
                .thread_name("polycentric-core")
                .enable_all()
                .build()
                .map_err(|e| {
                    crate::logging::log_error(|| format!("failed to build tokio runtime: {e}"))
                })
                .ok()
        })
        .as_ref()
}

#[cfg(all(not(target_arch = "wasm32"), feature = "native-transport"))]
/// Returns `false` when the task could not be spawned (no usable tokio
/// runtime)
fn spawn<F: Future<Output = ()> + Send + 'static>(fut: F) -> bool {
    match tokio::runtime::Handle::try_current() {
        Ok(handle) => {
            handle.spawn(fut);
            true
        }
        Err(_) => match fallback_runtime() {
            Some(runtime) => {
                runtime.spawn(fut);
                true
            }
            None => {
                log_error(|| "no tokio runtime; dropping query task".to_string());
                false
            }
        },
    }
}

/// Degrades any panics that occur when awaiting this future to errors,
/// for logging panics and failing gracefully.
async fn panic_to_err<F: Future>(fut: F) -> Result<F::Output, String> {
    match std::panic::AssertUnwindSafe(fut).catch_unwind().await {
        Ok(output) => Ok(output),
        Err(payload) => {
            let msg = panic_payload_message(payload.as_ref());
            log_error(|| msg.clone());
            Err(msg)
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

/// Type-erased `merge_fn`. Reduces every page held for this key, plus the
/// value last emitted, to the value to emit next. The client handle lets a
/// merge call `validate_event`. `previous` is `None` until something has been
/// emitted, and again after an invalidation.
pub type MergeFn<T> =
    Arc<dyn Fn(&[T], Option<&T>, &Arc<Mutex<PolycentricClient>>) -> T + Send + Sync + 'static>;

/// Query keys are an array of strings and assist with caching, retry strategies etc.
pub type QueryKey = Vec<String>;

/// Shared, lockable handle to a single `QueryState`. The data cache
/// is shared across fetches with the same key; fan-out state
/// (subscriber, pending count) is local to each subscribe call.
pub type QueryStateHandle<T> = Arc<Mutex<QueryState<T>>>;

/// Every page a server has answered with, newest last.
pub struct QueryResponseInfo<T> {
    pages: Vec<T>,
    epoch: u64,
}

impl<T> QueryResponseInfo<T> {
    /// A server that has not answered yet. Epoch 0 is older than every
    /// fan-out, so the first response is never mistaken for a late one.
    fn empty() -> Self {
        Self {
            pages: Vec::new(),
            epoch: 0,
        }
    }

    /// Take a new response from this server.
    fn update(&mut self, response: T, epoch: u64, update_mode: UpdateMode) {
        match update_mode {
            UpdateMode::Replace => {
                // Only replace with responses from a newer fan-out
                if self.epoch >= epoch {
                    return;
                }

                self.pages = vec![response];
                self.epoch = epoch;
            }
            UpdateMode::Merge => {
                self.pages.push(response);
                self.epoch = max(self.epoch, epoch);
            }
        }
    }
}

/// Per-key cache of the pages each server has answered with.
pub struct QueryState<T> {
    /// Each server's pages, keyed by `server_url`.
    pub data: HashMap<String, QueryResponseInfo<T>>,

    /// Incrementing integer for each fan-out for this state instance.
    /// Prevents a slow server from overriding data from a newer fan-out
    /// with a response that arrives really late.
    pub epoch: u64,

    /// The epoch of the latest fan-out with a `Replace` update mode.
    /// We discard a merge response if its epoch is from before this one.
    pub latest_replace_epoch: u64,

    /// The value last handed to a subscriber, passed back to `merge_fn`.
    /// Cleared on invalidation, so a refresh reorders from scratch.
    pub emitted: Option<T>,
}

impl<T> Default for QueryState<T> {
    /// Empty query state with no ongoing fan-out.
    fn default() -> Self {
        Self {
            data: HashMap::new(),
            epoch: 0,
            latest_replace_epoch: 0,
            emitted: None,
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
    pub fn update(&mut self, server: &str, value: T, epoch: u64, update_mode: UpdateMode) {
        // Doing a replace fan-out means we want to discard any data from before.
        // Don't even merge data if a replace fan-out has started after this data
        // was requested.
        if update_mode == UpdateMode::Merge && self.latest_replace_epoch > epoch {
            return;
        }

        self.data
            .entry(server.to_string())
            .or_insert_with(QueryResponseInfo::empty)
            .update(value, epoch, update_mode);
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

/// Reduce every cached page into one value. `None` when no server has
/// responded yet.
fn compute_merged<T: Clone>(
    data: &HashMap<String, QueryResponseInfo<T>>,
    previous: Option<&T>,
    merge_fn: &MergeFn<T>,
    client: &Arc<Mutex<PolycentricClient>>,
) -> Option<T> {
    if data.is_empty() {
        return None;
    }

    // Fixed server order; HashMap iteration order is arbitrary.
    let mut entries: Vec<&QueryResponseInfo<T>> = Vec::with_capacity(data.len());
    let mut servers: Vec<&String> = data.keys().collect();
    servers.sort_unstable();
    for server in servers {
        entries.push(&data[server]);
    }

    let pages: Vec<T> = entries
        .into_iter()
        .flat_map(|info| info.pages.iter().cloned())
        .collect();

    Some(merge_fn(&pages, previous, client))
}

/// Merge, emit, and remember what was emitted.
fn compute_emission<T: Clone>(
    state: &mut QueryState<T>,
    merge_fn: &MergeFn<T>,
    client: &Arc<Mutex<PolycentricClient>>,
) -> Option<T> {
    let emission = compute_merged(&state.data, state.emitted.as_ref(), merge_fn, client)?;
    state.emitted = Some(emission.clone());
    Some(emission)
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
        M: Fn(&[T], Option<&T>, &Arc<Mutex<PolycentricClient>>) -> T + Send + Sync + 'static,
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
                let mut s = state.lock_recover();
                compute_emission(&mut s, &merge_fn, &client)
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

            spawn_fanout(FanoutContext {
                state,
                servers: target_servers,
                update_mode,
                emit_mode,
                server_timeout,
                query_fn: query_fn.clone(),
                merge_fn: merge_fn.clone(),
                client: client.clone(),
                subscriber,
            });
        })
    }

    /// Clear the data cache of every key under `prefix`, which is a key
    /// partition: `["feed"]` clears `["feed", "explore", …]` too.
    pub fn invalidate(&self, prefix: &QueryKey) {
        for (key, state) in self.queries.lock_recover().iter() {
            if !key.starts_with(prefix) {
                continue;
            }
            let mut state = state.lock_recover();

            // Clear cached server responses
            state.data.clear();
            state.emitted = None;

            // Create a dummy replace epoch so that any pending merge requests have
            // their responses discarded.
            state.next_fanout(UpdateMode::Replace);
        }
    }

    /// Clear the data cache of every query key. No subscribers are
    /// notified — orchestration of in-flight observables lives outside
    /// the core.
    pub fn invalidate_all(&self) {
        for state in self.queries.lock_recover().values() {
            let mut state = state.lock_recover();
            state.data.clear();
            state.emitted = None;
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
    client.lock_recover().servers()
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
            .lock_recover()
            .entry(query_key.clone())
            .or_insert_with(make_new_state)
            .clone()
    } else {
        make_new_state()
    }
}

/// Required arguments to pass to [`spawn_fanout`].
#[derive(Clone)]
struct FanoutContext<T>
where
    T: Clone + Send + Sync + 'static,
{
    state: QueryStateHandle<T>,
    servers: Vec<String>,
    server_timeout: Duration,
    update_mode: UpdateMode,
    emit_mode: EmitMode,
    merge_fn: MergeFn<T>,
    query_fn: QueryFnBox<T>,
    client: Arc<Mutex<PolycentricClient>>,
    subscriber: Arc<Subscriber<QueryResult<T>>>,
}

/// Calls each server in concurrently and emits responses onto
/// `subscriber`.
fn spawn_fanout<T>(context: FanoutContext<T>)
where
    T: Clone + Send + Sync + 'static,
{
    let epoch = {
        let mut state = context.state.lock_recover();
        state.next_fanout(context.update_mode)
    };
    let pending = Arc::new(AtomicUsize::new(context.servers.len()));
    let successful = Arc::new(AtomicUsize::new(0));

    for server_url in context.servers.clone() {
        // Clone task context to move into closure
        let task_context = context.clone();
        let task_server_url = server_url.clone();
        let task_pending = pending.clone();
        let task_successful = successful.clone();

        let spawned = spawn(async move {
            get_server_response(
                &task_context,
                task_server_url,
                task_pending,
                task_successful,
                epoch,
            )
            .await;
        });

        // If there's an error spawning a task, then the async runtime has
        // encountered an error and no other tasks will be spawnable. We
        // fail early.
        if !spawned {
            let msg = format!("error [{server_url}]: runtime unavailable");
            log_error(|| msg.clone());
            if !context.subscriber.is_closed() {
                context.subscriber.error(msg);
                context.subscriber.complete();
            }
            return;
        }
    }
}

/// Await and record one server's response in a [`spawn_fanout`] call,
/// updating shared counters and passing the response to subscribers
/// when successful.
async fn get_server_response<T>(
    context: &FanoutContext<T>,
    server_url: String,
    pending: Arc<AtomicUsize>,
    successful: Arc<AtomicUsize>,
    epoch: u64,
) where
    T: Clone + Send + Sync + 'static,
{
    // Drop (cancel) the query if the server doesn't respond in time.
    let result = match panic_to_err(select(
        (context.query_fn)(server_url.clone()),
        Delay::new(context.server_timeout),
    ))
    .await
    {
        Ok(Either::Left((result, _))) => result,
        Ok(Either::Right(_)) => {
            let msg = format!(
                "timeout [{server_url}]: no response within {}ms",
                context.server_timeout.as_millis()
            );
            log_warn(|| msg.clone());
            Err(msg)
        }
        Err(panic_msg) => Err(format!("error [{server_url}]: internal panic: {panic_msg}")),
    };

    let (snapshot, error_msg, is_last) = {
        let mut s = context.state.lock_recover();

        let pending_servers = pending.fetch_sub(1, Ordering::SeqCst) - 1;
        let successful_servers = if result.is_ok() {
            successful.fetch_add(1, Ordering::SeqCst) + 1
        } else {
            successful.load(Ordering::SeqCst)
        };
        let error_msg = match result {
            Ok(value) => {
                s.update(&server_url, value, epoch, context.update_mode);
                None
            }
            Err(msg) => Some(msg),
        };
        let is_last = pending_servers == 0;

        // The default emit mode publishes only the settled result,
        // so we skip intermediate merges
        let snapshot = if context.emit_mode == EmitMode::Default && !is_last {
            None
        } else {
            let status = s.status(pending_servers);
            Some(QueryResult {
                data: compute_emission(&mut s, &context.merge_fn, &context.client),
                status,
                successful_servers,
                pending_servers,
            })
        };

        (snapshot, error_msg, is_last)
    };

    // Publish results
    if context.subscriber.is_closed() {
        return;
    }
    if let Some(snapshot) = snapshot {
        context.subscriber.next(snapshot);
    }
    if let Some(msg) = error_msg {
        context.subscriber.error(msg);
    }
    if is_last {
        context.subscriber.complete();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    enum Ev {
        Next(Vec<u8>),
        Error(String),
        Complete,
    }

    /// Parse comma-joined numbers from every response, dedup, and re-join.
    fn merge_join(
        values: &[Vec<u8>],
        _previous: Option<&Vec<u8>>,
        _client: &Arc<Mutex<PolycentricClient>>,
    ) -> Vec<u8> {
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
                Ev::Error(_) => {}
                Ev::Complete => break,
            }
        }
        out
    }

    /// `merge_join` with the biggest number first, standing in for a rank.
    fn merge_ranked(
        values: &[Vec<u8>],
        _previous: Option<&Vec<u8>>,
        client: &Arc<Mutex<PolycentricClient>>,
    ) -> Vec<u8> {
        let joined = merge_join(values, None, client);
        let mut items: Vec<u32> = String::from_utf8_lossy(&joined)
            .split(',')
            .filter(|s| !s.is_empty())
            .map(|s| s.parse::<u32>().unwrap())
            .collect();
        items.sort_unstable_by_key(|n| std::cmp::Reverse(*n));
        items
            .iter()
            .map(u32::to_string)
            .collect::<Vec<_>>()
            .join(",")
            .into_bytes()
    }

    /// Ranked merge that keeps the order it last emitted.
    fn merge_anchored(
        values: &[Vec<u8>],
        previous: Option<&Vec<u8>>,
        client: &Arc<Mutex<PolycentricClient>>,
    ) -> Vec<u8> {
        let split = |bytes: &[u8]| -> Vec<String> {
            String::from_utf8_lossy(bytes)
                .split(',')
                .filter(|item| !item.is_empty())
                .map(str::to_string)
                .collect()
        };
        let ranked = split(&merge_ranked(values, None, client));
        let mut out: Vec<String> = match previous {
            Some(previous) => split(previous)
                .into_iter()
                .filter(|item| ranked.contains(item))
                .collect(),
            None => Vec::new(),
        };
        for item in ranked {
            if !out.contains(&item) {
                out.push(item);
            }
        }
        out.join(",").into_bytes()
    }

    /// `run_fanout` with the order-holding merge.
    async fn run_anchored_fanout(
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
            merge_anchored,
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
                Ev::Error(_) => {}
                Ev::Complete => break,
            }
        }
        out
    }

    #[tokio::test]
    async fn a_merge_can_keep_the_order_it_emitted() {
        let client = Arc::new(Mutex::new(PolycentricClient::new()));
        client.lock_recover().set_servers(vec!["s1".to_string()]);
        let qc: QueryClient<Vec<u8>> = QueryClient::new(client);
        let key: QueryKey = vec!["feed".to_string()];

        let first = run_anchored_fanout(&qc, &key, "5,3").await;
        assert_eq!(first.last().unwrap(), "5,3");

        // Outranks both, but they are already emitted, so it goes last.
        let second = run_anchored_fanout(&qc, &key, "9").await;
        assert_eq!(second.last().unwrap(), "5,3,9");

        // Invalidation drops the anchor, so a refresh ranks from scratch.
        qc.invalidate(&key);
        let third = run_anchored_fanout(&qc, &key, "9,5,3").await;
        assert_eq!(third.last().unwrap(), "9,5,3");
    }

    /// `run_fanout` in the default (replace) update mode.
    async fn run_replace_fanout(
        qc: &QueryClient<Vec<u8>>,
        key: &QueryKey,
        response: &'static str,
    ) -> Vec<String> {
        let obs = qc.fetch(
            Some(key.clone()),
            move |_server| async move { Ok(response.as_bytes().to_vec()) },
            merge_join,
            None,
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
                Ev::Error(_) => {}
                Ev::Complete => break,
            }
        }
        out
    }

    #[tokio::test]
    async fn a_replace_fanout_emits_the_first_response() {
        let client = Arc::new(Mutex::new(PolycentricClient::new()));
        client.lock_recover().set_servers(vec!["s1".to_string()]);
        let qc: QueryClient<Vec<u8>> = QueryClient::new(client);
        let key: QueryKey = vec!["events".to_string()];

        let first = run_replace_fanout(&qc, &key, "1,2").await;
        assert_eq!(
            first.last().map(String::as_str),
            Some("1,2"),
            "a server's first response is not a late one"
        );

        let second = run_replace_fanout(&qc, &key, "3,4").await;
        assert_eq!(
            second.last().map(String::as_str),
            Some("3,4"),
            "a later fan-out replaces what the server said before"
        );
    }

    #[tokio::test]
    async fn merge_fanouts_accumulate_batches() {
        let client = Arc::new(Mutex::new(PolycentricClient::new()));
        client.lock_recover().set_servers(vec!["s1".to_string()]);
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

    #[tokio::test]
    async fn fanout_panics_become_errors() {
        let client = Arc::new(Mutex::new(PolycentricClient::new()));
        client.lock_recover().set_servers(vec!["s1".to_string()]);
        let qc: QueryClient<Vec<u8>> = QueryClient::new(client);
        let key: QueryKey = vec!["panic".to_string()];

        let obs = qc.fetch(
            Some(key.clone()),
            move |_server| async move { panic!("boom") },
            merge_join,
            None,
        );

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let tx_error = tx.clone();
        let tx_complete = tx.clone();
        let _sub = obs.subscribe(
            move |r: QueryResult<Vec<u8>>| {
                let _ = tx.send(Ev::Next(r.data.unwrap_or_default()));
            },
            move |e| {
                let _ = tx_error.send(Ev::Error(e));
            },
            move || {
                let _ = tx_complete.send(Ev::Complete);
            },
        );

        let mut errors = Vec::new();
        let mut completed = false;
        while let Some(ev) = rx.recv().await {
            match ev {
                Ev::Next(_) => {}
                Ev::Error(e) => errors.push(e),
                Ev::Complete => {
                    completed = true;
                    break;
                }
            }
        }

        assert!(completed, "a panicking server must not hang the subscriber");
        assert_eq!(errors.len(), 1, "the panic must surface as one error");
        assert!(
            errors[0].contains("error [s1]: internal panic"),
            "unexpected error message: {}",
            errors[0]
        );

        // The core survives: a follow-up query still works.
        let again = run_fanout(&qc, &key, "1,2").await;
        assert_eq!(again.last().map(String::as_str), Some("1,2"));
    }
}
