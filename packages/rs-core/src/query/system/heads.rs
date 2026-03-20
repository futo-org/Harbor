use crate::query::internal::{ProcessHeadsQuery, ProcessHeadsResult};
use crate::store::EventStore;
use polycentric_common::error::CoreError;
use polycentric_common::models::internal::EventKey;
use std::collections::HashMap;

/// Process heads query engine for handling process heads queries
#[derive(Debug)]
pub struct HeadsQueryEngine;

impl HeadsQueryEngine {
    /// Create a new heads query engine
    pub fn new() -> Self {
        Self
    }

    /// Query process heads for a system
    pub fn query_heads(
        &self,
        query: ProcessHeadsQuery,
        event_store: &EventStore,
    ) -> Result<ProcessHeadsResult, CoreError> {
        let process_states = event_store.get_process_heads(&query.system);
        let mut heads = HashMap::new();

        // Get the actual events for each process head
        for (process_id, process_state) in process_states {
            let event_key = EventKey {
                system_key_type: query.system.key_type,
                system_key: query.system.key.clone(),
                process: process_id.process.clone(),
                logical_clock: process_state.logical_clock,
            };

            if let Some(signed_event) = event_store.get_event(&event_key) {
                heads.insert(process_id.clone(), signed_event.clone());
            }
        }

        Ok(ProcessHeadsResult { heads })
    }
}

impl Default for HeadsQueryEngine {
    fn default() -> Self {
        Self::new()
    }
}
