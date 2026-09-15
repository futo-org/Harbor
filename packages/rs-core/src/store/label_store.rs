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
        match self.by_target.get_mut(&target) {
            Some(labels) => {
                if !labels.contains(label) {
                    labels.insert(label.clone());
                }
            }
            None => {
                self.by_target
                    .insert(target, BTreeSet::from([label.clone()]));
            }
        }
    }

    /// Get the event keys of any known label events targeting `target`.
    pub fn get(&self, target: &EventKey) -> impl Iterator<Item = &EventKey> + use<'_> {
        self.by_target.get(target).into_iter().flatten()
    }
}
