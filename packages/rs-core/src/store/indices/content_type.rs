use polycentric_common::models::internal::{EventKey, EventPointer, SystemKey};
use polycentric_common::models::protos::{ContentType, SignedEvent};
use prost::Message;
use std::collections::BTreeMap;

/// Index for events by content type
#[derive(Debug, Default)]
pub struct ContentTypeIndex {
    /// Events by content type, ordered by time
    events_by_content_type: BTreeMap<ContentType, Vec<EventPointer>>,

    /// Events by system and content type
    events_by_system_content_type: BTreeMap<(SystemKey, ContentType), Vec<EventPointer>>,
}

impl ContentTypeIndex {
    /// Create a new content type index
    pub fn new() -> Self {
        Self {
            events_by_content_type: BTreeMap::new(),
            events_by_system_content_type: BTreeMap::new(),
        }
    }

    /// Add an event to the content type indices
    pub fn add_event(
        &mut self,
        event_key: &EventKey,
        system_key: &SystemKey,
        content_type: ContentType,
        unix_milliseconds: u64,
    ) {
        let event_pointer = EventPointer {
            key: event_key.clone(),
            unix_milliseconds,
            content_type,
        };

        // Add to global content type index
        self.events_by_content_type
            .entry(content_type)
            .or_default()
            .push(event_pointer.clone());

        // Add to system-specific content type index
        let system_content_key = (system_key.clone(), content_type);
        self.events_by_system_content_type
            .entry(system_content_key)
            .or_default()
            .push(event_pointer);
    }

    /// Get latest events by content type for a system
    pub fn get_latest_by_content_type<'a>(
        &self,
        system: &SystemKey,
        content_type: ContentType,
        events: &'a BTreeMap<EventKey, SignedEvent>,
    ) -> Vec<&'a SignedEvent> {
        let system_content_key = (system.clone(), content_type);

        if let Some(pointers) = self.events_by_system_content_type.get(&system_content_key) {
            // Get the latest event for each process
            let mut latest_by_process: BTreeMap<Vec<u8>, &EventPointer> = BTreeMap::new();

            for pointer in pointers {
                if let Some(event) = events.get(&pointer.key) {
                    if let Ok(decoded_event) =
                        polycentric_common::models::protos::Event::decode(event.event.as_slice())
                    {
                        if let Some(process) = &decoded_event.process {
                            let process_id = process.process.clone();

                            match latest_by_process.get(&process_id) {
                                Some(existing)
                                    if existing.key.logical_clock >= pointer.key.logical_clock =>
                                {
                                    // Keep existing
                                }
                                _ => {
                                    latest_by_process.insert(process_id, pointer);
                                }
                            }
                        }
                    }
                }
            }

            latest_by_process
                .values()
                .filter_map(|pointer| events.get(&pointer.key))
                .collect()
        } else {
            Vec::new()
        }
    }

    /// Get all events by content type for a system
    pub fn get_all_by_content_type<'a>(
        &self,
        system: &SystemKey,
        content_type: ContentType,
        events: &'a BTreeMap<EventKey, SignedEvent>,
    ) -> Vec<&'a SignedEvent> {
        let system_content_key = (system.clone(), content_type);

        if let Some(pointers) = self.events_by_system_content_type.get(&system_content_key) {
            pointers
                .iter()
                .filter_map(|pointer| events.get(&pointer.key))
                .collect()
        } else {
            Vec::new()
        }
    }
}
