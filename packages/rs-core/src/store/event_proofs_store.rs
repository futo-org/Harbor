use super::keys::EventKey;
use polycentric_common::models::protos_v2::EventProof;
use std::collections::BTreeMap;

#[derive(Debug, Default)]
pub struct EventProofsStore {
    proofs: BTreeMap<EventKey, Vec<EventProof>>,
}

impl EventProofsStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Store `proofs` for the event at `key`. A no-op when `proofs` is empty.
    pub fn insert(&mut self, key: EventKey, proofs: Vec<EventProof>) {
        if proofs.is_empty() {
            return;
        }
        self.proofs.insert(key, proofs);
    }

    /// Proofs associated with `key`. Empty slice when none.
    pub fn get(&self, key: &EventKey) -> &[EventProof] {
        self.proofs.get(key).map(|v| v.as_slice()).unwrap_or(&[])
    }

    /// Drop any proofs associated with `key`.
    pub fn remove(&mut self, key: &EventKey) {
        self.proofs.remove(key);
    }
}
