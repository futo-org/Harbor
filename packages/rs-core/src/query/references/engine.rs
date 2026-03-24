use crate::query::{CountReferencesResult, QueryError, QueryResult, ReferencesResult};
use crate::store::ReferenceStorage;
use polycentric_common::models::internal::{EventKey, ProcessId, SystemKey};
use polycentric_common::models::protos::Pointer;

/// Query for events that reference a specific event
#[derive(Debug, Clone)]
pub struct ReferencesQuery {
    pub target_system: SystemKey,
    pub target_process: ProcessId,
    pub target_logical_clock: u64,
    pub limit: Option<usize>,
    pub cursor: Option<Vec<u8>>,
}

/// Query for counting references by type
#[derive(Debug, Clone)]
pub struct CountReferencesQuery {
    pub target_system: SystemKey,
    pub target_process: ProcessId,
    pub target_logical_clock: u64,
    pub reference_type: Option<u64>,
}

#[derive(Debug)]
pub struct ReferencesQueryEngine;

impl ReferencesQueryEngine {
    pub fn new() -> Self {
        Self
    }

    /// Query events that reference a specific target event
    pub fn query_references(
        &self,
        query: &ReferencesQuery,
        event_store: &dyn ReferenceStorage,
    ) -> QueryResult<ReferencesResult> {
        let target_key = EventKey {
            system_key_type: query.target_system.key_type,
            system_key: query.target_system.key.clone(),
            process: query.target_process.process.clone(),
            logical_clock: query.target_logical_clock,
        };

        let referencing_events = event_store.get_referencing_events(&target_key);
        let owned_events: Vec<_> = referencing_events.into_iter().cloned().collect();

        Ok(ReferencesResult {
            events: owned_events,
            related_events: Vec::new(),
            cursor: Vec::new(),
        })
    }

    /// Count references to a specific target event (not implemented)
    pub fn count_references(
        &self,
        _query: &CountReferencesQuery,
        _event_store: &dyn ReferenceStorage,
    ) -> QueryResult<CountReferencesResult> {
        Ok(CountReferencesResult { counts: Vec::new() })
    }

    /// Get a reference for a pointer
    pub fn get_reference_by_pointer(&self, pointer: &Pointer) -> QueryResult<Option<EventKey>> {
        let system = pointer
            .system
            .as_ref()
            .ok_or_else(|| QueryError::InvalidReference("Pointer missing system".to_string()))?;

        let process = pointer
            .process
            .as_ref()
            .ok_or_else(|| QueryError::InvalidReference("Pointer missing process".to_string()))?;

        let event_key = EventKey {
            system_key_type: system.key_type,
            system_key: system.key.clone(),
            process: process.process.clone(),
            logical_clock: pointer.logical_clock,
        };

        Ok(Some(event_key))
    }
}

impl Default for ReferencesQueryEngine {
    fn default() -> Self {
        Self::new()
    }
}
