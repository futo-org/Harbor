//! The Harbor client SDK: everything a Harbor client does on top of the
//! protocol engine in [`crate::api::PolycentricCore`]. It owns local storage,
//! key custody, the commit pipeline, sync, identity management and pairing,
//! so each host language only adds an ergonomic wrapper.

pub mod backup;
pub mod client;
pub mod commit;
pub mod error;
pub mod events;
pub mod ffi;
pub mod http;
pub mod identity;
pub mod keys;
pub mod logins;
pub mod network;
pub mod pairing;
pub mod queries;
pub mod storage;
pub mod sync;
pub mod types;

pub use client::{Client, ClientConfig};
pub use error::{SdkError, SdkResult};

#[cfg(test)]
mod ffi_tests;
#[cfg(test)]
mod test_server;
#[cfg(test)]
mod tests;
