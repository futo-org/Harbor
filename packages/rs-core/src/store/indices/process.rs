use crate::store::{ProcessState, SystemState};
use polycentric_common::models::internal::{EventKey, ProcessId, SystemKey};
use polycentric_common::models::protos::SignedEvent;
use std::collections::{BTreeMap, HashMap};

/// Index for events by process
#[derive(Debug, Default)]
pub struct ProcessIndex {
    /// Events by system and process, ordered by logical clock
    events_by_system_process: BTreeMap<(SystemKey, ProcessId), BTreeMap<u64, EventKey>>,

    /// Process heads (latest logical clock for each process)
    process_heads: BTreeMap<(SystemKey, ProcessId), ProcessState>,

    /// System metadata (servers, authorities, processes list)
    system_states: BTreeMap<SystemKey, SystemState>,
}

impl ProcessIndex {
    /// Create a new process index
    pub fn new() -> Self {
        Self {
            events_by_system_process: BTreeMap::new(),
            process_heads: BTreeMap::new(),
            system_states: BTreeMap::new(),
        }
    }

    /// Add an event to the process indices
    pub fn add_event(
        &mut self,
        event_key: &EventKey,
        system_key: &SystemKey,
        process_id: &ProcessId,
        logical_clock: u64,
        unix_milliseconds: u64,
    ) {
        let system_process_key = (system_key.clone(), process_id.clone());

        // Add to system-process index
        self.events_by_system_process
            .entry(system_process_key.clone())
            .or_default()
            .insert(logical_clock, event_key.clone());

        // Update process head if this is the latest event
        let current_head = self.process_heads.get(&system_process_key);
        if current_head.is_none_or(|head| head.logical_clock < logical_clock) {
            self.process_heads.insert(
                system_process_key.clone(),
                ProcessState {
                    logical_clock,
                    unix_milliseconds,
                    ranges: Vec::new(), // TODO: Implement range tracking in the future
                },
            );
        }

        // Ensure system state exists (for metadata like servers, authorities)
        self.system_states
            .entry(system_key.clone())
            .or_insert_with(|| SystemState {
                servers: Vec::new(),
                authorities: Vec::new(),
                processes: Vec::new(), // TODO: Maintain process list
            });
    }

    /// Get events in a logical clock range
    pub fn get_events_in_range<'a>(
        &self,
        system: &SystemKey,
        process: &ProcessId,
        start_clock: u64,
        end_clock: u64,
        events: &'a BTreeMap<EventKey, SignedEvent>,
    ) -> Vec<&'a SignedEvent> {
        let system_process_key = (system.clone(), process.clone());

        if let Some(process_events) = self.events_by_system_process.get(&system_process_key) {
            process_events
                .range(start_clock..=end_clock)
                .filter_map(|(_, event_key)| events.get(event_key))
                .collect()
        } else {
            Vec::new()
        }
    }

    /// Get process heads for a system
    pub fn get_process_heads(&self, system: &SystemKey) -> HashMap<ProcessId, ProcessState> {
        self.process_heads
            .iter()
            .filter_map(|((sys, proc), state)| {
                if sys == system {
                    Some((proc.clone(), state.clone()))
                } else {
                    None
                }
            })
            .collect()
    }

    /// Get system state
    pub fn get_system_state(&self, system: &SystemKey) -> Option<&SystemState> {
        self.system_states.get(system)
    }

    /// Get all systems
    pub fn get_all_systems(&self) -> Vec<&SystemKey> {
        self.system_states.keys().collect()
    }
}
