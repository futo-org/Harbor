//! The FFI face of the query engine: [`QueryObservable`] and the
//! [`QueryObserver`] callback bindings implement to receive results.

use std::sync::Arc;

use crate::rx::observable::Observable;
use crate::rx::subscription::Subscription;

/// State the query is in.
/// Success is when all queries have completed.
#[derive(Clone, Copy, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum QueryStatus {
    /// At least one server has not yet responded.
    Loading,
    /// No servers are outstanding and there is data (fetched or cached).
    Success,
    /// No servers are outstanding and none returned data.
    Error,
}

/// Result of the query that is emitted to subscribers
#[derive(Clone)]
pub struct QueryResult<T> {
    /// Merged data so far, or `None` if nothing is cached or fetched yet.
    pub data: Option<T>,
    /// Overall progress of the fan-out.
    pub status: QueryStatus,
    /// Servers that have responded successfully in this fan-out.
    pub successful_servers: usize,
    /// Servers still outstanding in this fan-out.
    pub pending_servers: usize,
}

/// Convert a query payload into the FFI-facing `Vec<u8>` representation
/// used by `QueryObservable` emissions.
pub trait ToFfiBytes {
    /// Serialize `self` for an FFI emission.
    fn to_ffi_bytes(&self) -> Vec<u8>;
}

impl ToFfiBytes for Vec<u8> {
    fn to_ffi_bytes(&self) -> Vec<u8> {
        self.clone()
    }
}

/// [`QueryResult`] as delivered to bindings.
#[derive(uniffi::Record)]
pub struct QueryResultFfi {
    /// Merged payload, usually serialized protobuf bytes (the per-query docs
    /// on `Query` say which message), or `None` if there is no data yet.
    pub data: Option<Vec<u8>>,
    /// Overall progress of the fan-out.
    pub status: QueryStatus,
    /// Servers that have responded successfully in this fan-out.
    pub successful_servers: u32,
    /// Servers still outstanding in this fan-out.
    pub pending_servers: u32,
}

/// Callback implemented by bindings to receive query emissions.
#[uniffi::export(with_foreign)]
pub trait QueryObserver: Send + Sync {
    /// A new merged result. Called once per emission (cache snapshot,
    /// server responses, final result).
    fn next(&self, result: QueryResultFfi);
    /// A single server failed or timed out. Not terminal: other servers'
    /// results may still follow. Messages are prefixed with the server URL.
    fn error(&self, message: String);
    /// No further emissions will be made. Streaming queries may never
    /// complete.
    fn complete(&self);
}

/// A lazily-started query returned by `PolycentricCore::fetch_query`.
#[uniffi::export]
pub trait QueryObservable: Send + Sync {
    /// Run the query (emitting any cached value first) and deliver results to
    /// `observer` until the returned [`Subscription`] is unsubscribed.
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
                    successful_servers: result.successful_servers as u32,
                    pending_servers: result.pending_servers as u32,
                });
            },
            move |message| error.error(message),
            move || complete.complete(),
        )
    }
}
