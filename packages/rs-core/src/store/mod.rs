//! In-memory stores backing [`crate::client::PolycentricClient`]. Nothing is
//! persisted: each store lives as long as the `PolycentricCore` that owns it.
//! All are keyed by [`keys::EventKey`] unless noted.

pub mod content_store;
pub mod event_proofs_store;
pub mod event_store;
pub mod identity_store;
pub mod keys;
pub mod label_store;
pub mod meta_store;
pub mod pairing_store;
