use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::Arc;

use polycentric_common::{error::CoreError, models::identity::IdentityChain};

use super::{content_store::ContentStore, event_store::EventStore};
use crate::identity::resolve_identity_chain;

/// Caches identity chains.
/// Use this instead of resolving the chains directly from identity events.
/// Be sure to invalidate cached chains when new identity events or content is stored.
#[derive(Default)]
pub struct IdentityStore {
    chains: RefCell<HashMap<String, Arc<IdentityChain>>>,
}

impl IdentityStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Get the identity chain for `identity`.
    /// Returns from the cache if it is present or derives a new cache entry for it.
    pub fn get_chain(
        &self,
        identity: &str,
        event_store: &EventStore,
        content_store: &ContentStore,
    ) -> Result<Arc<IdentityChain>, CoreError> {
        // Return cached chain if present
        if let Some(chain) = self.chains.borrow().get(identity) {
            return Ok(chain.clone());
        }

        // Derive new chain
        let chain = resolve_identity_chain(identity, event_store, content_store)?;
        let chain = Arc::new(chain);

        // Store and return derived chain
        self.chains
            .borrow_mut()
            .insert(identity.to_string(), chain.clone());

        Ok(chain)
    }

    /// Drop the cached chain for `identity`, if there is one.
    pub fn invalidate(&mut self, identity: &str) {
        self.chains.get_mut().remove(identity);
    }

    /// Clear the cache.
    pub fn invalidate_all(&mut self) {
        self.chains.get_mut().clear();
    }
}
