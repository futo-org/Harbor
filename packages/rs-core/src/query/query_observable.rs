use std::sync::Arc;

use crate::rx::observable::Observable;
use crate::rx::subscription::Subscription;

/// State the query is in.
/// Success is when all queries have completed.
#[derive(Clone, Copy, Debug, PartialEq, Eq, uniffi::Enum)]
pub enum QueryStatus {
    Loading,
    Success,
    Error,
}

/// Result of the query that is emitted to subscribers
#[derive(Clone)]
pub struct QueryResult<T> {
    pub data: Option<T>,
    pub status: QueryStatus,
}

/// Convert a query payload into the FFI-facing `Vec<u8>` representation
/// used by `QueryObservable` emissions.
pub trait ToFfiBytes {
    fn to_ffi_bytes(&self) -> Vec<u8>;
}

impl ToFfiBytes for Vec<u8> {
    fn to_ffi_bytes(&self) -> Vec<u8> {
        self.clone()
    }
}

#[derive(uniffi::Record)]
pub struct QueryResultFfi {
    pub data: Option<Vec<u8>>,
    pub status: QueryStatus,
}

#[uniffi::export(with_foreign)]
pub trait QueryObserver: Send + Sync {
    fn next(&self, result: QueryResultFfi);
    fn error(&self, message: String);
    fn complete(&self);
}

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
