// You must call this once
uniffi::setup_scaffolding!();

// Nothing here references it, but the cdylib must export its allocator and
// panic hook for the ubrn wasm player to call into.
#[cfg(target_arch = "wasm32")]
extern crate uniffi_runtime_wasm as _;

pub mod api;
pub mod client;
pub mod identity;
mod lock;
pub mod logging;
pub mod media;
pub mod query;
pub mod rx;
pub mod store;
pub mod sync;
pub mod vector_clock;
