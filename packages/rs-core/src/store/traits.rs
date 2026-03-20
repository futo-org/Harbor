use polycentric_common::models::internal::EventKey;
use polycentric_common::models::protos::SignedEvent;

/// Trait for event storage operations needed by query engines
pub trait EventStorage {
    /// Get an event by its key
    fn get_event(&self, key: &EventKey) -> Option<&SignedEvent>;

    /// Check if an event exists
    fn event_exists(&self, key: &EventKey) -> bool {
        self.get_event(key).is_some()
    }

    /// Check if an event has been deleted (has a tombstone)
    fn is_event_deleted(&self, key: &EventKey) -> bool;
}

/// Trait for reference tracking operations
pub trait ReferenceStorage {
    /// Get events that reference a specific target event
    fn get_referencing_events(&self, target: &EventKey) -> Vec<&SignedEvent>;

    /// Add a reference relationship
    fn add_reference(&mut self, referencing_event: &EventKey, target_event: &EventKey);

    /// Remove a reference relationship
    fn remove_reference(&mut self, referencing_event: &EventKey, target_event: &EventKey);
}
