use futures::{FutureExt, Stream, StreamExt};
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

/// Type-erased per-server stream of values, opened by a `StreamFnBox`.
#[cfg(not(target_arch = "wasm32"))]
pub type QueryStreamBox<T> = Pin<Box<dyn Stream<Item = Result<T, String>> + Send + 'static>>;
#[cfg(target_arch = "wasm32")]
pub type QueryStreamBox<T> = Pin<Box<dyn Stream<Item = Result<T, String>> + 'static>>;

/// Type-erased per-server `stream_fn`.
pub type StreamFnBox<T> =
    Arc<dyn Fn(String) -> QueryFutureBox<QueryStreamBox<T>> + Send + Sync + 'static>;

/// Delay before re-opening a server stream that ended or failed.
#[cfg(not(test))]
const RECONNECT_DELAY: Duration = Duration::from_secs(10);
#[cfg(test)]
const RECONNECT_DELAY: Duration = Duration::from_millis(200);
/// How often an idle stream task checks whether its subscriber left.
#[cfg(not(test))]
const CLOSE_POLL: Duration = Duration::from_secs(1);
#[cfg(test)]
const CLOSE_POLL: Duration = Duration::from_millis(50);

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

    /// Like `fetch`, but `stream_fn` opens a server stream and every value
    /// it yields is merged and emitted, so the observable never completes.
    pub fn subscribe<F, Fut, S, M>(
        &self,
        query_key: Option<QueryKey>,
        stream_fn: F,
        merge_fn: M,
        opts: Option<QueryOpts>,
    ) -> Observable<QueryResult<T>>
    where
        F: Fn(String) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<S, String>> + MaybeSend + 'static,
        S: Stream<Item = Result<T, String>> + MaybeSend + 'static,
        M: Fn(&[T], Option<&T>, &Arc<Mutex<PolycentricClient>>) -> T + Send + Sync + 'static,
    {
        let queries = self.queries.clone();
        let client = self.client.clone();
        let stream_fn: StreamFnBox<T> = Arc::new(move |server_url| {
            let opening = stream_fn(server_url);
            Box::pin(async move { opening.await.map(|s| Box::pin(s) as QueryStreamBox<T>) })
        });
        let merge_fn: MergeFn<T> = Arc::new(merge_fn);
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
            let target_servers = resolve_servers(servers.as_deref(), &client);

            let cached = {
                let mut s = state.lock_recover();
                compute_emission(&mut s, &merge_fn, &client)
            };
            if cached.is_some() {
                subscriber.next(QueryResult {
                    data: cached,
                    status: QueryStatus::Loading,
                    successful_servers: 0,
                    pending_servers: target_servers.len(),
                });
            }
            if target_servers.is_empty() {
                subscriber.complete();
                return;
            }

            let context = StreamContext {
                state,
                server_timeout,
                stream_fn: stream_fn.clone(),
                merge_fn: merge_fn.clone(),
                client: client.clone(),
                subscriber,
                pending: Arc::new(AtomicUsize::new(target_servers.len())),
                successful: Arc::new(AtomicUsize::new(0)),
            };
            for server_url in target_servers {
                let task_context = context.clone();
                let task_server_url = server_url.clone();
                if !spawn(async move { run_stream(task_context, task_server_url).await }) {
                    let msg = format!("error [{server_url}]: runtime unavailable");
                    log_error(|| msg.clone());
                    if !context.subscriber.is_closed() {
                        context.subscriber.error(msg);
                        context.subscriber.complete();
                    }
                    return;
                }
            }
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

/// Shared state of one `subscribe` call's server streams.
#[derive(Clone)]
struct StreamContext<T>
where
    T: Clone + Send + Sync + 'static,
{
    state: QueryStateHandle<T>,
    server_timeout: Duration,
    stream_fn: StreamFnBox<T>,
    merge_fn: MergeFn<T>,
    client: Arc<Mutex<PolycentricClient>>,
    subscriber: Arc<Subscriber<QueryResult<T>>>,
    /// Servers that have not sent their first value yet.
    pending: Arc<AtomicUsize>,
    successful: Arc<AtomicUsize>,
}

/// Keeps one server's stream open for as long as the subscriber is,
/// re-opening it after `RECONNECT_DELAY` whenever it ends.
async fn run_stream<T>(context: StreamContext<T>, server_url: String)
where
    T: Clone + Send + Sync + 'static,
{
    let mut delivered = false;
    loop {
        if context.subscriber.is_closed() {
            return;
        }
        let opened = match panic_to_err(select(
            (context.stream_fn)(server_url.clone()),
            Delay::new(context.server_timeout),
        ))
        .await
        {
            Ok(Either::Left((result, _))) => result,
            Ok(Either::Right(_)) => Err(format!(
                "timeout [{server_url}]: no response within {}ms",
                context.server_timeout.as_millis()
            )),
            Err(panic_msg) => Err(format!("error [{server_url}]: internal panic: {panic_msg}")),
        };

        match opened {
            Ok(mut stream) => loop {
                match select(stream.next(), Delay::new(CLOSE_POLL)).await {
                    Either::Left((Some(Ok(value)), _)) => {
                        deliver(&context, &server_url, value, &mut delivered);
                    }
                    Either::Left((Some(Err(msg)), _)) => {
                        log_warn(|| msg.clone());
                        context.subscriber.error(msg);
                        break;
                    }
                    Either::Left((None, _)) => break,
                    Either::Right(_) => {
                        if context.subscriber.is_closed() {
                            return;
                        }
                    }
                }
            },
            Err(msg) => {
                log_warn(|| msg.clone());
                context.subscriber.error(msg);
            }
        }

        let mut waited = Duration::ZERO;
        while waited < RECONNECT_DELAY {
            if context.subscriber.is_closed() {
                return;
            }
            Delay::new(CLOSE_POLL).await;
            waited += CLOSE_POLL;
        }
    }
}

/// Records one streamed value and emits the merged result.
fn deliver<T>(context: &StreamContext<T>, server_url: &str, value: T, delivered: &mut bool)
where
    T: Clone + Send + Sync + 'static,
{
    let snapshot = {
        let mut s = context.state.lock_recover();
        if !*delivered {
            *delivered = true;
            context.pending.fetch_sub(1, Ordering::SeqCst);
            context.successful.fetch_add(1, Ordering::SeqCst);
        }
        // Each value starts a new epoch so it replaces the server's last one.
        let epoch = s.next_fanout(UpdateMode::Replace);
        s.update(server_url, value, epoch, UpdateMode::Replace);
        let pending_servers = context.pending.load(Ordering::SeqCst);
        QueryResult {
            data: compute_emission(&mut s, &context.merge_fn, &context.client),
            status: s.status(pending_servers),
            successful_servers: context.successful.load(Ordering::SeqCst),
            pending_servers,
        }
    };
    context.subscriber.next(snapshot);
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

    // `subscribe` tests. Streams are built from `futures::stream`; a stream
    // that must stay open chains `pending()` so the task never reconnects.

    use crate::rx::subscription::Subscription;
    use futures::stream;
    use std::sync::atomic::AtomicBool;
    use std::time::Instant;

    type TestStream = Pin<Box<dyn Stream<Item = Result<Vec<u8>, String>> + Send>>;

    /// A stream of the given values that then stays open.
    fn open_stream(values: &[Result<&str, &str>]) -> TestStream {
        let items: Vec<Result<Vec<u8>, String>> = values
            .iter()
            .map(|v| v.map(|s| s.as_bytes().to_vec()).map_err(str::to_string))
            .collect();
        Box::pin(stream::iter(items).chain(stream::pending()))
    }

    /// Largest number across every server's latest value.
    fn merge_max(
        values: &[Vec<u8>],
        _previous: Option<&Vec<u8>>,
        _client: &Arc<Mutex<PolycentricClient>>,
    ) -> Vec<u8> {
        values
            .iter()
            .filter_map(|v| String::from_utf8_lossy(v).parse::<u32>().ok())
            .max()
            .unwrap_or(0)
            .to_string()
            .into_bytes()
    }

    enum SubEv {
        Next(String, QueryStatus),
        Error(String),
        Complete,
    }

    struct Collected {
        data: Vec<(String, QueryStatus)>,
        errors: Vec<String>,
        completed: bool,
    }

    async fn recv_timeout(
        rx: &mut tokio::sync::mpsc::UnboundedReceiver<SubEv>,
        ms: u64,
    ) -> Option<SubEv> {
        match select(Box::pin(rx.recv()), Delay::new(Duration::from_millis(ms))).await {
            Either::Left((ev, _)) => ev,
            Either::Right(_) => None,
        }
    }

    /// Subscribe to `obs` and gather `take` emissions, then whatever else
    /// arrives within `settle_ms`. The subscription is returned open.
    async fn collect(
        obs: &Observable<QueryResult<Vec<u8>>>,
        take: usize,
        settle_ms: u64,
    ) -> (Collected, Arc<Subscription>) {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let tx_err = tx.clone();
        let tx_complete = tx.clone();
        let sub = obs.subscribe(
            move |r: QueryResult<Vec<u8>>| {
                let data = String::from_utf8_lossy(&r.data.unwrap_or_default()).into_owned();
                let _ = tx.send(SubEv::Next(data, r.status));
            },
            move |e| {
                let _ = tx_err.send(SubEv::Error(e));
            },
            move || {
                let _ = tx_complete.send(SubEv::Complete);
            },
        );

        let mut out = Collected {
            data: Vec::new(),
            errors: Vec::new(),
            completed: false,
        };
        while out.data.len() < take {
            match recv_timeout(&mut rx, 5_000).await {
                Some(ev) => out.record(ev),
                None => panic!("expected {take} emissions, got {}", out.data.len()),
            }
        }
        let settle_until = Instant::now() + Duration::from_millis(settle_ms);
        loop {
            let left = settle_until.saturating_duration_since(Instant::now());
            if left.is_zero() {
                break;
            }
            match recv_timeout(&mut rx, left.as_millis() as u64).await {
                Some(ev) => out.record(ev),
                None => break,
            }
        }
        (out, sub)
    }

    impl Collected {
        fn record(&mut self, ev: SubEv) {
            match ev {
                SubEv::Next(d, s) => self.data.push((d, s)),
                SubEv::Error(e) => self.errors.push(e),
                SubEv::Complete => self.completed = true,
            }
        }
    }

    fn subscribe_client(servers: &[&str]) -> QueryClient<Vec<u8>> {
        let client = Arc::new(Mutex::new(PolycentricClient::new()));
        client
            .lock_recover()
            .set_servers(servers.iter().map(|s| s.to_string()).collect());
        QueryClient::new(client)
    }

    #[tokio::test]
    async fn subscribe_merges_the_latest_value_of_every_server() {
        let qc = subscribe_client(&["s1", "s2"]);
        let obs = qc.subscribe(
            Some(vec!["unread".to_string()]),
            |server: String| async move {
                Ok(match server.as_str() {
                    "s1" => open_stream(&[Ok("1"), Ok("3")]),
                    _ => open_stream(&[Ok("2")]),
                })
            },
            merge_max,
            None,
        );

        let (got, _sub) = collect(&obs, 3, 100).await;

        assert_eq!(got.data.len(), 3, "one emission per streamed value");
        assert_eq!(
            got.data[0].1,
            QueryStatus::Loading,
            "one server still pending"
        );
        let last = got.data.last().unwrap();
        assert_eq!(last.0, "3");
        assert_eq!(last.1, QueryStatus::Success);
        assert!(!got.completed, "a subscription never completes");
    }

    #[tokio::test]
    async fn subscribe_replaces_a_servers_earlier_value() {
        let qc = subscribe_client(&["s1"]);
        let obs = qc.subscribe(
            Some(vec!["unread".to_string()]),
            |_server: String| async move { Ok(open_stream(&[Ok("5"), Ok("2")])) },
            merge_max,
            None,
        );

        let (got, _sub) = collect(&obs, 2, 100).await;

        let data: Vec<&str> = got.data.iter().map(|(d, _)| d.as_str()).collect();
        assert_eq!(
            data,
            ["5", "2"],
            "the latest value wins, not the largest seen"
        );
    }

    #[tokio::test]
    async fn subscribe_emits_the_cached_value_before_the_stream() {
        let qc = subscribe_client(&["s1"]);
        let key = vec!["unread".to_string()];
        let first = qc.subscribe(
            Some(key.clone()),
            |_server: String| async move { Ok(open_stream(&[Ok("7")])) },
            merge_max,
            None,
        );
        let (_, sub) = collect(&first, 1, 0).await;
        sub.unsubscribe();

        let second = qc.subscribe(
            Some(key),
            |_server: String| async move { Ok(open_stream(&[])) },
            merge_max,
            None,
        );
        let (got, _sub) = collect(&second, 1, 100).await;

        assert_eq!(got.data, vec![("7".to_string(), QueryStatus::Loading)]);
    }

    #[tokio::test]
    async fn subscribe_reports_a_stream_error_without_completing() {
        let qc = subscribe_client(&["s1"]);
        let obs = qc.subscribe(
            Some(vec!["unread".to_string()]),
            |_server: String| async move { Ok(open_stream(&[Ok("1"), Err("boom")])) },
            merge_max,
            None,
        );

        let (got, _sub) = collect(&obs, 1, 300).await;

        // Every re-open replays the same stream, so the error may repeat.
        assert!(!got.errors.is_empty());
        assert!(got.errors.iter().all(|e| e == "boom"), "{:?}", got.errors);
        assert!(!got.completed);
    }

    #[tokio::test]
    async fn subscribe_reports_a_failed_open_without_completing() {
        let qc = subscribe_client(&["s1"]);
        let obs = qc.subscribe(
            Some(vec!["unread".to_string()]),
            |_server: String| async move { Err::<TestStream, _>("refused".to_string()) },
            merge_max,
            None,
        );

        let (got, _sub) = collect(&obs, 0, 300).await;

        assert!(!got.errors.is_empty());
        assert!(
            got.errors.iter().all(|e| e == "refused"),
            "{:?}",
            got.errors
        );
        assert!(got.data.is_empty());
        assert!(!got.completed);
    }

    #[tokio::test]
    async fn subscribe_without_servers_completes() {
        let qc = subscribe_client(&[]);
        let obs = qc.subscribe(
            Some(vec!["unread".to_string()]),
            |_server: String| async move { Ok(open_stream(&[Ok("1")])) },
            merge_max,
            None,
        );

        let (got, _sub) = collect(&obs, 0, 100).await;

        assert!(got.data.is_empty());
        assert!(got.completed);
    }

    /// A stream that flags when it is dropped.
    struct DropFlag {
        inner: TestStream,
        dropped: Arc<AtomicBool>,
    }

    impl Stream for DropFlag {
        type Item = Result<Vec<u8>, String>;
        fn poll_next(
            mut self: Pin<&mut Self>,
            cx: &mut std::task::Context<'_>,
        ) -> std::task::Poll<Option<Self::Item>> {
            self.inner.as_mut().poll_next(cx)
        }
    }

    impl Drop for DropFlag {
        fn drop(&mut self) {
            self.dropped.store(true, Ordering::SeqCst);
        }
    }

    #[tokio::test]
    async fn unsubscribing_drops_the_server_stream() {
        let dropped = Arc::new(AtomicBool::new(false));
        let flag = dropped.clone();
        let qc = subscribe_client(&["s1"]);
        let obs = qc.subscribe(
            Some(vec!["unread".to_string()]),
            move |_server: String| {
                let dropped = flag.clone();
                async move {
                    Ok(DropFlag {
                        inner: open_stream(&[Ok("1")]),
                        dropped,
                    })
                }
            },
            merge_max,
            None,
        );

        let (_, sub) = collect(&obs, 1, 0).await;
        sub.unsubscribe();

        // The idle task notices within one `CLOSE_POLL`.
        let deadline = Instant::now() + CLOSE_POLL * 3;
        while !dropped.load(Ordering::SeqCst) && Instant::now() < deadline {
            Delay::new(Duration::from_millis(50)).await;
        }
        assert!(
            dropped.load(Ordering::SeqCst),
            "stream still open after unsubscribe"
        );
    }

    fn data_of(got: &Collected) -> Vec<&str> {
        got.data.iter().map(|(d, _)| d.as_str()).collect()
    }

    #[tokio::test]
    async fn subscribe_reopens_a_stream_that_ended() {
        let opens = Arc::new(AtomicUsize::new(0));
        let counter = opens.clone();
        let qc = subscribe_client(&["s1"]);
        let obs = qc.subscribe(
            Some(vec!["unread".to_string()]),
            move |_server: String| {
                let n = counter.fetch_add(1, Ordering::SeqCst);
                async move {
                    Ok(if n == 0 {
                        // Ends right after its only value.
                        Box::pin(stream::iter([Ok(b"1".to_vec())])) as TestStream
                    } else {
                        open_stream(&[Ok("2")])
                    })
                }
            },
            merge_max,
            None,
        );

        let (got, _sub) = collect(&obs, 2, 0).await;

        assert_eq!(data_of(&got), ["1", "2"]);
        assert_eq!(
            opens.load(Ordering::SeqCst),
            2,
            "opened once more after the end"
        );
        assert!(got.errors.is_empty(), "a clean end is not an error");
    }

    #[tokio::test]
    async fn subscribe_reopens_after_a_failed_open() {
        let opens = Arc::new(AtomicUsize::new(0));
        let counter = opens.clone();
        let qc = subscribe_client(&["s1"]);
        let obs = qc.subscribe(
            Some(vec!["unread".to_string()]),
            move |_server: String| {
                let n = counter.fetch_add(1, Ordering::SeqCst);
                async move {
                    if n == 0 {
                        Err("refused".to_string())
                    } else {
                        Ok(open_stream(&[Ok("4")]))
                    }
                }
            },
            merge_max,
            None,
        );

        let (got, _sub) = collect(&obs, 1, 0).await;

        assert_eq!(got.errors, vec!["refused".to_string()]);
        assert_eq!(data_of(&got), ["4"]);
    }

    #[tokio::test]
    async fn subscribe_times_out_an_open_that_hangs() {
        let qc = subscribe_client(&["s1"]);
        let opts = QueryOpts {
            server_timeout_ms: Some(100),
            ..Default::default()
        };
        let obs = qc.subscribe(
            Some(vec!["unread".to_string()]),
            |_server: String| futures::future::pending::<Result<TestStream, String>>(),
            merge_max,
            Some(opts),
        );

        let (got, _sub) = collect(&obs, 0, 400).await;

        assert!(got.data.is_empty());
        assert!(
            got.errors
                .first()
                .is_some_and(|e| e.starts_with("timeout [s1]")),
            "unexpected errors: {:?}",
            got.errors
        );
        assert!(!got.completed);
    }

    #[tokio::test]
    async fn subscribe_honours_the_servers_override() {
        let opened = Arc::new(Mutex::new(Vec::<String>::new()));
        let record = opened.clone();
        let qc = subscribe_client(&["s1", "s2"]);
        let opts = QueryOpts {
            servers: Some(vec!["only".to_string()]),
            ..Default::default()
        };
        let obs = qc.subscribe(
            Some(vec!["unread".to_string()]),
            move |server: String| {
                record.lock().unwrap().push(server);
                async move { Ok(open_stream(&[Ok("1")])) }
            },
            merge_max,
            Some(opts),
        );

        let (got, _sub) = collect(&obs, 1, 100).await;

        assert_eq!(*opened.lock().unwrap(), vec!["only".to_string()]);
        assert_eq!(got.data, vec![("1".to_string(), QueryStatus::Success)]);
    }

    #[tokio::test]
    async fn subscribe_stays_loading_until_every_server_has_answered() {
        let qc = subscribe_client(&["s1", "s2"]);
        let obs = qc.subscribe(
            Some(vec!["unread".to_string()]),
            |server: String| async move {
                Ok(match server.as_str() {
                    "s1" => open_stream(&[Ok("1")]),
                    _ => open_stream(&[]),
                })
            },
            merge_max,
            None,
        );

        let (got, _sub) = collect(&obs, 1, 200).await;

        assert_eq!(got.data, vec![("1".to_string(), QueryStatus::Loading)]);
    }

    #[tokio::test]
    async fn invalidate_drops_the_streamed_cache() {
        let qc = subscribe_client(&["s1"]);
        let key = vec!["unread".to_string()];
        let first = qc.subscribe(
            Some(key.clone()),
            |_server: String| async move { Ok(open_stream(&[Ok("7")])) },
            merge_max,
            None,
        );
        let (_, sub) = collect(&first, 1, 0).await;
        sub.unsubscribe();

        qc.invalidate(&key);

        let second = qc.subscribe(
            Some(key),
            |_server: String| async move { Ok(open_stream(&[Ok("9")])) },
            merge_max,
            None,
        );
        let (got, _sub) = collect(&second, 1, 100).await;

        assert_eq!(got.data, vec![("9".to_string(), QueryStatus::Success)]);
    }
}
