use crate::query::internal::CrdtResult;
use polycentric_common::error::CoreError;
use polycentric_common::models::protos::lww_element_set::Operation;
use polycentric_common::models::protos::{Event, LwwElement, SignedEvent};
use prost::Message;
use std::collections::HashMap;

/// CRDT resolver for handling Last-Writer-Wins operations and vector clock comparisons
#[derive(Debug)]
pub struct CrdtResolver;

impl CrdtResolver {
    /// Create a new CRDT resolver
    pub fn new() -> Self {
        CrdtResolver
    }

    /// Resolve LWW Element Set state from a collection of events
    /// For each value, keep the event with the highest (timestamp, logical_clock).
    /// At the end, include all values whose latest op is ADD.
    #[allow(clippy::type_complexity)]
    pub fn resolve_lww_element_set(
        &self,
        events: &[SignedEvent],
    ) -> Result<HashMap<Vec<u8>, (u64, u64, Operation)>, CoreError> {
        let mut element_map: HashMap<Vec<u8>, (u64, u64, Operation)> = HashMap::new();

        for signed_event in events {
            let event = Event::decode(signed_event.event.as_slice())
                .map_err(|e| CoreError::InvalidEvent(format!("Failed to decode event: {}", e)))?;

            if let Some(lww_element_set) = &event.lww_element_set {
                let key = lww_element_set.value.clone();
                let timestamp = lww_element_set.unix_milliseconds;
                let logical_clock = event.logical_clock;
                let operation = Operation::try_from(lww_element_set.operation).map_err(|_| {
                    CoreError::InvalidEvent("Invalid LWW element set operation".to_string())
                })?;

                match element_map.get(&key) {
                    Some((existing_timestamp, existing_logical_clock, _)) => {
                        if (timestamp, logical_clock)
                            > (*existing_timestamp, *existing_logical_clock)
                        {
                            element_map.insert(key, (timestamp, logical_clock, operation));
                        }
                    }
                    None => {
                        element_map.insert(key, (timestamp, logical_clock, operation));
                    }
                }
            }
        }

        Ok(element_map)
    }

    /// Get the final set of elements (only ADD operations with highest timestamps)
    pub fn get_final_lww_element_set(
        &self,
        events: &[SignedEvent],
    ) -> Result<Vec<Vec<u8>>, CoreError> {
        let element_map = self.resolve_lww_element_set(events)?;

        let mut final_elements = Vec::new();

        for (element_value, &(_, _, operation)) in &element_map {
            if operation == Operation::Add {
                final_elements.push(element_value.clone());
            }
        }

        Ok(final_elements)
    }

    /// Resolve a single LWW Element from events
    pub fn resolve_lww_element(
        &self,
        events: &[SignedEvent],
    ) -> Result<Option<LwwElement>, CoreError> {
        let mut latest_element: Option<(u64, LwwElement)> = None;

        for signed_event in events {
            let event = Event::decode(signed_event.event.as_slice())
                .map_err(|e| CoreError::InvalidEvent(format!("Failed to decode event: {}", e)))?;

            if let Some(lww_element) = &event.lww_element {
                let logical_clock = event.logical_clock;

                match &latest_element {
                    Some((existing_clock, _)) if *existing_clock > logical_clock => {
                        // Keep existing
                    }
                    Some((existing_clock, _)) if *existing_clock == logical_clock => {
                        // Tie-break using deterministic criteria
                        if let Some((_, existing_element)) = &latest_element {
                            if signed_event.event.len() > existing_element.value.len() {
                                latest_element = Some((logical_clock, lww_element.clone()));
                            }
                        }
                    }
                    _ => {
                        // New or higher logical clock
                        latest_element = Some((logical_clock, lww_element.clone()));
                    }
                }
            }
        }

        Ok(latest_element.map(|(_, element)| element))
    }

    /// Resolve CRDT value from a collection of events using LWW semantics
    pub fn resolve_crdt_value(&self, events: &[SignedEvent]) -> Result<CrdtResult, CoreError> {
        let mut latest_time = 0u64;
        let mut result_value: Option<Vec<u8>> = None;

        for signed_event in events {
            let event = Event::decode(signed_event.event.as_slice())
                .map_err(|e| CoreError::InvalidEvent(format!("Failed to decode event: {}", e)))?;

            if let Some(lww_element) = &event.lww_element {
                if event.unix_milliseconds.unwrap_or(0) > latest_time {
                    latest_time = event.unix_milliseconds.unwrap_or(0);
                    result_value = Some(lww_element.value.clone());
                }
            }
        }

        Ok(CrdtResult {
            value: result_value,
            missing_data: false, // TODO: Implement missing data detection
        })
    }
}

impl Default for CrdtResolver {
    fn default() -> Self {
        CrdtResolver::new()
    }
}
