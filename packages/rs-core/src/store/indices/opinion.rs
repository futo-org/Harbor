use polycentric_common::models::internal::EventKey;
use polycentric_common::models::internal::SystemKey;
use polycentric_common::models::protos::{Event, SignedEvent};
use std::collections::BTreeMap;

/// Index for opinion events
#[derive(Debug, Default)]
pub struct OpinionIndex {
    /// Opinion tracking (opinion events by target event, then by system)
    opinion_index: BTreeMap<EventKey, BTreeMap<SystemKey, Vec<EventKey>>>,

    /// Opinion events by system, then by target event
    opinions_by_system: BTreeMap<SystemKey, BTreeMap<EventKey, Vec<EventKey>>>,
}

impl OpinionIndex {
    /// Create a new opinion index
    pub fn new() -> Self {
        Self {
            opinion_index: BTreeMap::new(),
            opinions_by_system: BTreeMap::new(),
        }
    }

    /// Update opinion index for an event
    pub fn update_opinion_index(
        &mut self,
        event_key: &EventKey,
        event: &Event,
    ) -> Result<(), polycentric_common::error::CoreError> {
        for reference in &event.references {
            if let Some(target_event_key) = reference.to_event_key() {
                let system = event.system.as_ref().ok_or_else(|| {
                    polycentric_common::error::CoreError::InvalidEvent(
                        "Event missing system".to_string(),
                    )
                })?;

                let system_key =
                    polycentric_common::models::internal::SystemKey::from_public_key(system);

                self.opinion_index
                    .entry(target_event_key.clone())
                    .or_default()
                    .entry(system_key.clone())
                    .or_default()
                    .push(event_key.clone());

                self.opinions_by_system
                    .entry(system_key.clone())
                    .or_default()
                    .entry(target_event_key.clone())
                    .or_default()
                    .push(event_key.clone())
            }
        }
        Ok(())
    }

    /// Get all opinion events that reference a target event
    pub fn get_opinions_for_target<'a>(
        &self,
        target: &EventKey,
        events: &'a BTreeMap<EventKey, SignedEvent>,
    ) -> Vec<&'a SignedEvent> {
        if let Some(target_opinions) = self.opinion_index.get(target) {
            let mut opinion_events = Vec::new();
            for system_opinions in target_opinions.values() {
                for opinion_event_key in system_opinions {
                    if let Some(signed_event) = events.get(opinion_event_key) {
                        opinion_events.push(signed_event);
                    }
                }
            }
            opinion_events
        } else {
            Vec::new()
        }
    }

    /// Get opinion events for a target event by a specific system
    pub fn get_opinions_for_target_by_system<'a>(
        &self,
        target: &EventKey,
        system: &SystemKey,
        events: &'a BTreeMap<EventKey, SignedEvent>,
    ) -> Vec<&'a SignedEvent> {
        if let Some(target_opinions) = self.opinion_index.get(target) {
            if let Some(system_opinions) = target_opinions.get(system) {
                system_opinions
                    .iter()
                    .filter_map(|opinion_event_key| events.get(opinion_event_key))
                    .collect()
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        }
    }

    /// Get all opinion events for a specific system
    pub fn get_opinions_by_system<'a>(
        &self,
        system: &SystemKey,
        events: &'a BTreeMap<EventKey, SignedEvent>,
    ) -> BTreeMap<EventKey, Vec<&'a SignedEvent>> {
        let mut opinion_events: BTreeMap<EventKey, Vec<&'a SignedEvent>> = BTreeMap::new();

        if let Some(system_opinions) = self.opinions_by_system.get(system) {
            for (target_event_key, system_opinions) in system_opinions {
                let mut opinion_events_for_target: Vec<&'a SignedEvent> = vec![];

                for opinion_event_key in system_opinions {
                    if let Some(signed_event) = events.get(opinion_event_key) {
                        opinion_events_for_target.push(signed_event);
                    }
                }

                opinion_events.insert(target_event_key.clone(), opinion_events_for_target);
            }

            opinion_events
        } else {
            BTreeMap::new()
        }
    }
}
