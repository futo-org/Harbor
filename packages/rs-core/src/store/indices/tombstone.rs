use polycentric_common::models::internal::EventKey;
use polycentric_common::models::protos::{Delete, Event, SignedEvent};
use prost::Message;
use std::collections::BTreeMap;

/// Index for event tombstones (deleted events)
#[derive(Debug, Default)]
pub struct TombstoneIndex {
    /// Tombstone storage: maps deleted event keys to their deletion event keys
    tombstones: BTreeMap<EventKey, EventKey>,
}

impl TombstoneIndex {
    /// Create a new tombstone index
    pub fn new() -> Self {
        Self {
            tombstones: BTreeMap::new(),
        }
    }

    /// Handle DELETE events by creating tombstones for the target events
    pub fn handle_delete_event(
        &mut self,
        delete_event: &Event,
        delete_event_key: &EventKey,
    ) -> Result<(), polycentric_common::error::CoreError> {
        let delete_content = Delete::decode(delete_event.content.as_slice()).map_err(|e| {
            polycentric_common::error::CoreError::InvalidEvent(format!(
                "Failed to decode delete content: {}",
                e
            ))
        })?;

        let target_process = delete_content.process.as_ref().ok_or_else(|| {
            polycentric_common::error::CoreError::InvalidEvent(
                "Delete event missing target process".to_string(),
            )
        })?;

        // The tombstone key uses:
        // - system: from the delete event (deleter's system)
        // - process: from the delete content (target's process)
        // - logical_clock: from the delete content (target's logical clock)
        let target_event_key = EventKey {
            system_key_type: delete_event.system.as_ref().unwrap().key_type,
            system_key: delete_event.system.as_ref().unwrap().key.clone(),
            process: target_process.process.clone(),
            logical_clock: delete_content.logical_clock,
        };

        self.tombstones
            .insert(target_event_key, delete_event_key.clone());

        Ok(())
    }

    /// Check if an event has been deleted (has a tombstone)
    pub fn is_event_deleted(&self, key: &EventKey) -> bool {
        self.tombstones.contains_key(key)
    }

    /// Get the deletion event key for a deleted event, if it exists
    pub fn get_deletion_event_key(&self, key: &EventKey) -> Option<&EventKey> {
        self.tombstones.get(key)
    }

    /// Get an event by its key, respecting tombstones
    pub fn get_event<'a>(
        &self,
        key: &EventKey,
        events: &'a BTreeMap<EventKey, SignedEvent>,
    ) -> Option<&'a SignedEvent> {
        if let Some(deletion_event_key) = self.tombstones.get(key) {
            return events.get(deletion_event_key);
        }

        events.get(key)
    }

    /// Get the deletion event for a deleted event, if it exists
    pub fn get_deletion_event<'a>(
        &self,
        key: &EventKey,
        events: &'a BTreeMap<EventKey, SignedEvent>,
    ) -> Option<&'a SignedEvent> {
        if let Some(deletion_event_key) = self.tombstones.get(key) {
            events.get(deletion_event_key)
        } else {
            None
        }
    }
}
