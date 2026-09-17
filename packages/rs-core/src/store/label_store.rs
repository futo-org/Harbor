use super::keys::EventKey;
use std::collections::{BTreeMap, BTreeSet};

/// Index for mapping an event to any label events that target it.
#[derive(Debug, Default)]
pub struct LabelStore {
    /// Maps event key -> set of event keys for label events targeting it.
    by_target: BTreeMap<EventKey, BTreeSet<EventKey>>,
}

impl LabelStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Record a label event `label` targeting the event `target`.
    pub fn insert(&mut self, target: EventKey, label: &EventKey) {
        let labels = self.by_target.entry(target).or_default();
        if !labels.contains(label) {
            labels.insert(label.clone());
        }
    }

    /// Get the event keys of any known label events targeting `target`.
    pub fn get(&self, target: &EventKey) -> impl Iterator<Item = &EventKey> {
        self.by_target.get(target).into_iter().flatten()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use polycentric_common::models::{collections, protos_v2::KeyType};

    /// Build a sample event key for a feed event or label event.
    fn key(identity_byte: &str, is_label: bool, signer_byte: u8, sequence: u64) -> EventKey {
        EventKey {
            identity: identity_byte.repeat(32),
            collection: if is_label {
                collections::LABELS
            } else {
                collections::FEED
            },
            signed_by_key_type: KeyType::Ed25519 as i32,
            signed_by_key: vec![signer_byte; 32],
            sequence,
        }
    }

    fn target_1() -> EventKey {
        key("a1", false, 0x01, 1)
    }

    fn target_2() -> EventKey {
        key("a2", false, 0x02, 2)
    }

    fn target_3() -> EventKey {
        key("a3", false, 0x03, 3)
    }

    fn label_1() -> EventKey {
        key("b1", true, 0xb1, 1)
    }

    fn label_2() -> EventKey {
        key("b2", true, 0xb2, 2)
    }

    /// Normalized output from querying the label store for `target`.
    /// Used for checking the label store's output without introducing ordering
    /// assumptions.
    fn labels_of(store: &LabelStore, target: &EventKey) -> BTreeSet<EventKey> {
        store.get(target).cloned().collect()
    }

    #[test]
    fn label_store_empty_returns_no_labels() {
        let store = LabelStore::new();

        assert_eq!(labels_of(&store, &target_1()), BTreeSet::new());
        assert_eq!(labels_of(&store, &target_2()), BTreeSet::new());
    }

    #[test]
    fn label_store_insert_get() {
        let mut store = LabelStore::new();
        store.insert(target_1(), &label_1());

        assert_eq!(labels_of(&store, &target_1()), BTreeSet::from([label_1()]));
    }

    #[test]
    fn label_store_aggregates_labels() {
        let mut store = LabelStore::new();
        store.insert(target_1(), &label_1());
        store.insert(target_1(), &label_2());

        assert_eq!(
            labels_of(&store, &target_1()),
            BTreeSet::from([label_1(), label_2()])
        );
    }

    #[test]
    fn label_store_separates_targets() {
        let mut store = LabelStore::new();
        store.insert(target_1(), &label_1());
        store.insert(target_2(), &label_2());

        assert_eq!(labels_of(&store, &target_1()), BTreeSet::from([label_1()]));
        assert_eq!(labels_of(&store, &target_2()), BTreeSet::from([label_2()]));
        assert_eq!(labels_of(&store, &target_3()), BTreeSet::new());
    }

    #[test]
    fn label_store_insert_is_idempotent() {
        let mut store = LabelStore::new();
        store.insert(target_1(), &label_1());
        store.insert(target_1(), &label_1());

        assert_eq!(labels_of(&store, &target_1()), BTreeSet::from([label_1()]));
    }
}
