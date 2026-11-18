//! A minimal push-based observable used by the query engine.

/// [`observable::Observable`] and its [`observable::Subscriber`] handle.
pub mod observable;
/// The cancellation handle returned by `subscribe`.
pub mod subscription;
