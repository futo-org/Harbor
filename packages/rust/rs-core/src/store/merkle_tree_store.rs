use std::cell::RefCell;
use std::collections::HashMap;

use polycentric_common::merkle::{self, CanonicalKey, MerkleTree};
use polycentric_common::models::protos_v2::SignedEvent;

use super::{event_store::EventStore, keys::EventKey};

/// Caches the Merkle tree over each collection's canonically-ordered signatures.
/// Call [`MerkleTreeStore::insert`] for every event stored.
#[derive(Default)]
pub struct MerkleTreeStore {
    /// By `(identity, collection)`.
    entries: RefCell<HashMap<(String, i32), Entry>>,
}

#[derive(Default)]
struct Entry {
    tree: MerkleTree,
    /// Key of the last leaf.
    last: Option<CanonicalKey>,
}

impl MerkleTreeStore {
    /// Merkle root of `(identity, collection)`, or empty if it has no events.
    pub fn root(&self, identity: &str, collection: i32, event_store: &EventStore) -> Vec<u8> {
        self.with_entry(identity, collection, event_store, |entry| {
            entry
                .tree
                .root(entry.tree.len())
                .map(|hash| hash.to_vec())
                .unwrap_or_default()
        })
    }

    /// Signature of the canonically-latest event, or empty if there are none.
    pub fn last_signature(
        &self,
        identity: &str,
        collection: i32,
        event_store: &EventStore,
    ) -> Vec<u8> {
        self.with_entry(identity, collection, event_store, |entry| {
            entry
                .last
                .as_ref()
                .map(|(_, _, signature)| signature.clone())
                .unwrap_or_default()
        })
    }

    /// Record a new event: appended if it sorts last, else the tree is dropped.
    pub fn insert(&mut self, key: &EventKey, signed_event: &SignedEvent) {
        let Some(order) = merkle::canonical_key(&signed_event.event_bytes, &signed_event.signature)
        else {
            return;
        };
        let entries = self.entries.get_mut();
        let entry_key = (key.identity.clone(), key.collection);
        if let Some(entry) = entries.get_mut(&entry_key)
            && !entry.push(order)
        {
            entries.remove(&entry_key);
        }
    }

    /// Run `f` on the entry of `(identity, collection)`, deriving it if not cached.
    fn with_entry<R>(
        &self,
        identity: &str,
        collection: i32,
        event_store: &EventStore,
        f: impl FnOnce(&Entry) -> R,
    ) -> R {
        let mut entries = self.entries.borrow_mut();
        let entry = entries
            .entry((identity.to_string(), collection))
            .or_insert_with(|| {
                Entry::new(
                    event_store
                        .by_identity_and_collection(identity, collection)
                        .map(|(_, se)| (se.event_bytes.as_slice(), se.signature.as_slice())),
                )
            });
        f(entry)
    }
}

impl Entry {
    /// Entry for the events given as `(event_bytes, signature)`.
    fn new<'a>(events: impl IntoIterator<Item = (&'a [u8], &'a [u8])>) -> Self {
        let mut orders: Vec<CanonicalKey> = events
            .into_iter()
            .filter_map(|(event_bytes, signature)| merkle::canonical_key(event_bytes, signature))
            .collect();
        orders.sort();

        let mut entry = Self::default();
        for order in orders {
            entry.push(order);
        }
        entry
    }

    /// Add the event with `order` if it sorts last; returns whether it did.
    fn push(&mut self, order: CanonicalKey) -> bool {
        if self.last.as_ref() >= Some(&order) {
            return false;
        }
        self.tree.push(&order.2);
        self.last = Some(order);
        true
    }
}
