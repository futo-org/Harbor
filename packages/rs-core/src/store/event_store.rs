use crate::store::indices::{
    ContentTypeIndex, OpinionIndex, ProcessIndex, ReferenceIndex, TimeIndex, TombstoneIndex,
    VectorClockIndex,
};
use crate::store::{EventStorage, ProcessState, ReferenceStorage, SystemState};
use polycentric_common::error::CoreError;
use polycentric_common::models::internal::{EventKey, ProcessId, SystemKey, TimelineKey};
use polycentric_common::models::protos::{ContentType, Event, SignedEvent};
use polycentric_common::models::VectorClock;
use prost::Message;
use std::cmp::Reverse;
use std::collections::{BTreeMap, BTreeSet, HashMap};

/// High-performance in-memory event store with multiple indices for fast queries
#[derive(Debug)]
pub struct EventStore {
    /// Primary storage: all events indexed by their unique key
    events: BTreeMap<EventKey, SignedEvent>,

    tombstone_index: TombstoneIndex,

    /// Content type index
    content_type_index: ContentTypeIndex,

    /// Process index
    process_index: ProcessIndex,

    /// Time index
    time_index: TimeIndex,

    /// Reference index
    reference_index: ReferenceIndex,

    /// Opinion index
    opinion_index: OpinionIndex,

    /// Vector clock index
    vector_clock_index: VectorClockIndex,
}

impl EventStore {
    /// Create a new empty event store
    pub fn new() -> Self {
        EventStore {
            events: BTreeMap::new(),
            tombstone_index: TombstoneIndex::new(),
            content_type_index: ContentTypeIndex::new(),
            process_index: ProcessIndex::new(),
            time_index: TimeIndex::new(),
            reference_index: ReferenceIndex::new(),
            opinion_index: OpinionIndex::new(),
            vector_clock_index: VectorClockIndex::new(),
        }
    }

    /// Ingest a signed event into the store, updating all indices
    pub fn ingest_event(&mut self, signed_event: SignedEvent) -> Result<EventKey, CoreError> {
        let event = Event::decode(signed_event.event.as_slice())
            .map_err(|e| CoreError::InvalidEvent(format!("Failed to decode event: {}", e)))?;

        let event_key = EventKey::from_event(&event)?;

        if self.events.contains_key(&event_key) {
            return Ok(event_key);
        }

        let system = event
            .system
            .as_ref()
            .ok_or_else(|| CoreError::InvalidEvent("Event missing system".to_string()))?;
        let process = event
            .process
            .as_ref()
            .ok_or_else(|| CoreError::InvalidEvent("Event missing process".to_string()))?;

        let system_key = SystemKey::from_public_key(system);
        let process_id = ProcessId::from_process(process);
        let content_type = ContentType::try_from(event.content_type)
            .map_err(|_| CoreError::InvalidEvent("Invalid content type".to_string()))?;

        if content_type == ContentType::Delete {
            self.tombstone_index
                .handle_delete_event(&event, &event_key)?;
        }

        self.events.insert(event_key.clone(), signed_event);

        // Update all indices
        self.content_type_index.add_event(
            &event_key,
            &system_key,
            content_type,
            event.unix_milliseconds.unwrap_or(0),
        );

        self.process_index.add_event(
            &event_key,
            &system_key,
            &process_id,
            event.logical_clock,
            event.unix_milliseconds.unwrap_or(0),
        );

        self.time_index
            .add_event(&event_key, event.unix_milliseconds.unwrap_or(0));

        if content_type == ContentType::Opinion {
            self.opinion_index
                .update_opinion_index(&event_key, &event)?;
        }

        // Update reference index for all events with references
        self.reference_index
            .update_reference_index(&event_key, &event)?;

        // Update vector clock state by merging with the event's vector clock
        if let Some(event_vector_clock) = &event.vector_clock {
            self.vector_clock_index
                .update_vector_clock(&system_key, event_vector_clock);
        }

        Ok(event_key)
    }

    pub fn global_timeline(&self) -> &BTreeSet<Reverse<TimelineKey>> {
        self.time_index.global_timeline()
    }

    pub fn profile_timeline(&self, profile: &SystemKey) -> Option<&BTreeSet<Reverse<TimelineKey>>> {
        self.time_index.profile_timeline(profile)
    }

    /// Get an event by its key
    pub fn get_event(&self, key: &EventKey) -> Option<&SignedEvent> {
        self.tombstone_index.get_event(key, &self.events)
    }

    /// Get an event by its key, ignoring tombstones (for internal use)
    pub fn get_event_raw(&self, key: &EventKey) -> Option<&SignedEvent> {
        self.events.get(key)
    }

    /// Check if an event has been deleted (has a tombstone)
    pub fn is_event_deleted(&self, key: &EventKey) -> bool {
        self.tombstone_index.is_event_deleted(key)
    }

    /// Get the deletion event for a deleted event, if it exists
    pub fn get_deletion_event(&self, key: &EventKey) -> Option<&SignedEvent> {
        self.tombstone_index.get_deletion_event(key, &self.events)
    }

    /// Get events in a logical clock range
    pub fn get_events_in_range(
        &self,
        system: &SystemKey,
        process: &ProcessId,
        start_clock: u64,
        end_clock: u64,
    ) -> Vec<&SignedEvent> {
        self.process_index.get_events_in_range(
            system,
            process,
            start_clock,
            end_clock,
            &self.events,
        )
    }

    /// Get latest events by content type for a system
    pub fn get_latest_by_content_type(
        &self,
        system: &SystemKey,
        content_type: ContentType,
    ) -> Vec<&SignedEvent> {
        self.content_type_index
            .get_latest_by_content_type(system, content_type, &self.events)
    }

    /// Get all events by content type for a system
    pub fn get_all_by_content_type(
        &self,
        system: &SystemKey,
        content_type: ContentType,
    ) -> Vec<&SignedEvent> {
        self.content_type_index
            .get_all_by_content_type(system, content_type, &self.events)
    }

    /// Get process heads for a system
    pub fn get_process_heads(&self, system: &SystemKey) -> HashMap<ProcessId, ProcessState> {
        self.process_index.get_process_heads(system)
    }

    /// Get system state
    pub fn get_system_state(&self, system: &SystemKey) -> Option<&SystemState> {
        self.process_index.get_system_state(system)
    }

    /// Get events that reference a specific target event
    pub fn get_referencing_events(&self, target: &EventKey) -> Vec<&SignedEvent> {
        self.reference_index
            .get_referencing_events(target, &self.events)
    }

    /// Get events within a time range, ordered by time
    /// For feed queries - filters out deleted events
    pub fn get_events_by_time_range_for_feed(
        &self,
        start_time: u64,
        end_time: u64,
        limit: Option<usize>,
    ) -> Vec<&SignedEvent> {
        self.time_index.get_events_by_time_range_for_feed(
            start_time,
            end_time,
            limit,
            &self.events,
            &|key| self.is_event_deleted(key),
        )
    }

    /// Get total number of events in the store
    pub fn event_count(&self) -> usize {
        self.events.len()
    }

    /// Get all systems in the store
    pub fn get_all_systems(&self) -> Vec<&SystemKey> {
        self.process_index.get_all_systems()
    }

    /// Get vector clock state for a system
    pub fn get_vector_clock_state(&self, system: &SystemKey) -> Option<&VectorClock> {
        self.vector_clock_index.get_vector_clock_state(system)
    }

    /// Get all opinion events that reference a target event
    pub fn get_opinions_for_target(&self, target: &EventKey) -> Vec<&SignedEvent> {
        self.opinion_index
            .get_opinions_for_target(target, &self.events)
    }

    /// Get opinion events for a target event by a specific system
    pub fn get_opinions_for_target_by_system(
        &self,
        target: &EventKey,
        system: &SystemKey,
    ) -> Vec<&SignedEvent> {
        self.opinion_index
            .get_opinions_for_target_by_system(target, system, &self.events)
    }

    pub fn get_opinions_by_system(
        &self,
        system: &SystemKey,
    ) -> BTreeMap<EventKey, Vec<&SignedEvent>> {
        self.opinion_index
            .get_opinions_by_system(system, &self.events)
    }
}

impl Default for EventStore {
    fn default() -> Self {
        Self::new()
    }
}

impl EventStorage for EventStore {
    fn get_event(&self, key: &EventKey) -> Option<&SignedEvent> {
        self.get_event(key)
    }

    fn is_event_deleted(&self, key: &EventKey) -> bool {
        self.is_event_deleted(key)
    }
}

impl ReferenceStorage for EventStore {
    fn get_referencing_events(&self, target: &EventKey) -> Vec<&SignedEvent> {
        self.reference_index
            .get_referencing_events(target, &self.events)
    }

    fn add_reference(&mut self, referencing_event: &EventKey, target_event: &EventKey) {
        self.reference_index
            .add_reference(referencing_event, target_event);
    }

    fn remove_reference(&mut self, referencing_event: &EventKey, target_event: &EventKey) {
        self.reference_index
            .remove_reference(referencing_event, target_event);
    }
}
