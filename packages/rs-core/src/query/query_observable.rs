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
    pub successful_servers: usize,
    pub pending_servers: usize,
}

/// Convert a query payload into the FFI-facing `Vec<u8>` representation
/// used by `ByteObservable` emissions.
pub trait ToFfiBytes {
    fn to_ffi_bytes(&self) -> Vec<u8>;
}

impl ToFfiBytes for Vec<u8> {
    fn to_ffi_bytes(&self) -> Vec<u8> {
        self.clone()
    }
}

/// A [`QueryResult`] with its payload encoded, as merged by the query layer.
/// [`crate::sdk::queries`] decodes it for hosts.
pub struct ByteResult {
    pub data: Option<Vec<u8>>,
    pub status: QueryStatus,
    pub successful_servers: u32,
    pub pending_servers: u32,
}

pub trait ByteObserver: Send + Sync {
    fn next(&self, result: ByteResult);
    fn error(&self, message: String);
    fn complete(&self);
}

pub trait ByteObservable: Send + Sync {
    fn subscribe(&self, observer: Arc<dyn ByteObserver>) -> Arc<Subscription>;
}

impl<T> ByteObservable for Observable<QueryResult<T>>
where
    T: ToFfiBytes + Clone + Send + Sync + 'static,
{
    fn subscribe(&self, observer: Arc<dyn ByteObserver>) -> Arc<Subscription> {
        let next = observer.clone();
        let error = observer.clone();
        let complete = observer;
        Observable::subscribe(
            self,
            move |result: QueryResult<T>| {
                next.next(ByteResult {
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
