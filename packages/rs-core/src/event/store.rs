//! EventStore is the core's owner of committed events.
//!
//! It exposes lifecycle hooks that the host platform (WASM, FFI, ...) wires
//! up with its own persistence backend. When `EventStore::add` is called
//! with a signed event, it invokes the registered `on_add` callback with
//! the raw signed event bytes — the host callback is responsible for
//! persisting the event (e.g. IndexedDB on the browser, SQLite on native).

use std::future::Future;
use std::pin::Pin;

#[derive(Debug, thiserror::Error)]
pub enum EventStoreError {
    #[error("No on_add hook registered on EventStore")]
    NoHook,

    #[error("on_add hook failed: {0}")]
    HookFailed(String),
}

/// Boxed future returned by an `on_add` hook.
pub type OnAddFuture = Pin<Box<dyn Future<Output = Result<(), EventStoreError>>>>;

/// Host-supplied hook invoked every time a signed event is added.
pub type OnAddHook = Box<dyn Fn(Vec<u8>) -> OnAddFuture>;

#[derive(Default)]
pub struct EventStore {
    on_add: Option<OnAddHook>,
}

impl EventStore {
    pub fn new() -> Self {
        Self { on_add: None }
    }

    /// Register the hook invoked on every `add`.
    pub fn set_on_add(&mut self, hook: OnAddHook) {
        self.on_add = Some(hook);
    }

    /// Add a signed event to the store, firing the registered `on_add` hook.
    pub async fn add(&self, signed_event_bytes: &[u8]) -> Result<(), EventStoreError> {
        let hook = self.on_add.as_ref().ok_or(EventStoreError::NoHook)?;
        hook(signed_event_bytes.to_vec()).await
    }
}

impl std::fmt::Debug for EventStore {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("EventStore")
            .field("on_add", &self.on_add.as_ref().map(|_| "<hook>"))
            .finish()
    }
}
