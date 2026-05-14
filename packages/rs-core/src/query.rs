//! Observable-query subsystem: the `QueryClient<T>` registry, the
//! per-RPC handlers it dispatches to, and the gRPC transport helper.
//! Public surface (`QueryClient`, `Query`, `QueryOpts`, `FetchMode`,
//! etc.) is re-exported from this module so consumers don't depend on
//! the internal file layout.

pub mod client;
pub mod event;
pub mod feed;
pub mod profile;
pub mod query_observable;
pub mod transport;

pub use client::{
    FetchMode, MaybeSend, MergeFn, QueryClient, QueryFnBox, QueryFutureBox, QueryKey, QueryOpts,
    QueryState,
};
pub use query_observable::{
    QueryObservable, QueryObserver, QueryResult, QueryResultFfi, QueryStatus, ToFfiBytes,
};
pub use transport::{channel, GrpcChannel};
