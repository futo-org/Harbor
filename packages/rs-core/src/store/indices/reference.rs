use polycentric_common::models::internal::EventKey;
use polycentric_common::models::protos::{Event, SignedEvent};
use std::collections::{BTreeMap, HashSet};

/// Index for event references
#[derive(Debug, Default)]
pub struct ReferenceIndex {
    /// Reference tracking (which events reference which)
    reference_index: BTreeMap<EventKey, HashSet<EventKey>>,
}

impl ReferenceIndex {
    /// Create a new reference index
    pub fn new() -> Self {
        Self {
            reference_index: BTreeMap::new(),
        }
    }

    /// Update reference index for an event
    pub fn update_reference_index(
        &mut self,
        event_key: &EventKey,
        event: &Event,
    ) -> Result<(), polycentric_common::error::CoreError> {
        for reference in &event.references {
            if let Some(target_event_key) = reference.to_event_key() {
                self.add_reference(event_key, &target_event_key);
            }
        }
        Ok(())
    }

    /// Add a reference relationship
    pub fn add_reference(&mut self, referencing_event: &EventKey, target_event: &EventKey) {
        self.reference_index
            .entry(target_event.clone())
            .or_default()
            .insert(referencing_event.clone());
    }

    /// Remove a reference relationship
    pub fn remove_reference(&mut self, referencing_event: &EventKey, target_event: &EventKey) {
        if let Some(referencing_set) = self.reference_index.get_mut(target_event) {
            referencing_set.remove(referencing_event);
            if referencing_set.is_empty() {
                self.reference_index.remove(target_event);
            }
        }
    }

    /// Get events that reference a specific target event
    pub fn get_referencing_events<'a>(
        &self,
        target: &EventKey,
        events: &'a BTreeMap<EventKey, SignedEvent>,
    ) -> Vec<&'a SignedEvent> {
        if let Some(referencing_keys) = self.reference_index.get(target) {
            referencing_keys
                .iter()
                .filter_map(|key| events.get(key))
                .collect()
        } else {
            Vec::new()
        }
    }
}
