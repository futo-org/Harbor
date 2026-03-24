use polycentric_common::models::internal::SystemKey;
use polycentric_common::models::VectorClock;
use std::collections::BTreeMap;

/// Index for vector clock state tracking
#[derive(Debug, Default)]
pub struct VectorClockIndex {
    /// Vector clock state: tracks current vector clock knowledge per system
    vector_clock_state: BTreeMap<SystemKey, VectorClock>,
}

impl VectorClockIndex {
    /// Create a new vector clock index
    pub fn new() -> Self {
        Self {
            vector_clock_state: BTreeMap::new(),
        }
    }

    /// Update vector clock state by merging with an event's vector clock
    pub fn update_vector_clock(
        &mut self,
        system_key: &SystemKey,
        event_vector_clock: &VectorClock,
    ) {
        let empty_clock = VectorClock {
            logical_clocks: Vec::new(),
        };
        let current_vector_clock = self
            .vector_clock_state
            .get(system_key)
            .unwrap_or(&empty_clock);

        // Merge the event's vector clock with our current knowledge
        let merged_clock = current_vector_clock.merge(event_vector_clock);
        self.vector_clock_state
            .insert(system_key.clone(), merged_clock);
    }

    /// Get vector clock state for a system
    pub fn get_vector_clock_state(&self, system: &SystemKey) -> Option<&VectorClock> {
        self.vector_clock_state.get(system)
    }

    /// Get all systems with vector clock state
    pub fn get_all_systems(&self) -> Vec<&SystemKey> {
        self.vector_clock_state.keys().collect()
    }
}
