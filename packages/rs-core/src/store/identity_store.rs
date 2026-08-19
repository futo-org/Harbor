//! Memoizes identity chains resolved from the event and content stores.

use polycentric_common::models::identity::IdentityChain;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Default)]
pub struct IdentityStore {
    identity_chains: Mutex<HashMap<String, Arc<IdentityChain>>>,
}

impl IdentityStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// The memoized chain for `identity`, if one has been resolved.
    pub fn get_chain(&self, identity: &str) -> Option<Arc<IdentityChain>> {
        self.identity_chains
            .lock()
            .unwrap()
            .get(identity)
            .map(Arc::clone)
    }

    /// Memoize `chain` as the resolved chain for `identity`.
    pub fn insert_chain(&self, identity: &str, chain: Arc<IdentityChain>) {
        self.identity_chains
            .lock()
            .unwrap()
            .insert(identity.to_owned(), chain);
    }

    /// Drop every memoized chain, so they are resolved again on next use.
    pub fn clear(&self) {
        self.identity_chains.lock().unwrap().clear();
    }
}
