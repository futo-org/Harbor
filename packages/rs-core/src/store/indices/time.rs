use polycentric_common::models::internal::{EventKey, SystemKey, TimelineKey};
use polycentric_common::models::protos::{ContentType, SignedEvent};
use prost::Message;
use std::cmp::Reverse;
use std::collections::{BTreeMap, BTreeSet};

/// Index for events by time
#[derive(Debug, Default)]
pub struct TimeIndex {
    /// Events by time for feed queries
    events_by_time: BTreeMap<u64, Vec<EventKey>>,

    /// Global timeline for all events ever encountered
    global_timeline: BTreeSet<Reverse<TimelineKey>>,

    /// Timelines for each profile
    profile_timelines: BTreeMap<SystemKey, BTreeSet<Reverse<TimelineKey>>>,
}

impl TimeIndex {
    /// Create a new time index
    pub fn new() -> Self {
        Self {
            events_by_time: BTreeMap::new(),
            global_timeline: BTreeSet::new(),
            profile_timelines: BTreeMap::new(),
        }
    }

    /// Add an event to the time index
    pub fn add_event(&mut self, event_key: &EventKey, unix_milliseconds: u64) {
        self.events_by_time
            .entry(unix_milliseconds)
            .or_default()
            .push(event_key.clone());

        self.global_timeline.insert(Reverse(TimelineKey {
            timestamp: unix_milliseconds,
            event_key: event_key.clone(),
        }));

        let system_key = SystemKey {
            key_type: event_key.system_key_type,
            key: event_key.system_key.clone(),
        };

        if !self.profile_timelines.contains_key(&system_key) {
            self.profile_timelines
                .insert(system_key.clone(), BTreeSet::new());
        }

        let timeline = match self.profile_timelines.get_mut(&system_key) {
            Some(timeline) => timeline,
            None => return, // Should never happen
        };

        timeline.insert(Reverse(TimelineKey {
            timestamp: unix_milliseconds,
            event_key: event_key.clone(),
        }));
    }

    /// Get events within a time range, ordered by time
    /// For feed queries - filters out deleted events
    pub fn get_events_by_time_range_for_feed<'a>(
        &self,
        start_time: u64,
        end_time: u64,
        limit: Option<usize>,
        events: &'a BTreeMap<EventKey, SignedEvent>,
        is_event_deleted: &dyn Fn(&EventKey) -> bool,
    ) -> Vec<&'a SignedEvent> {
        let mut result_events = Vec::new();

        for (_, event_keys) in self.events_by_time.range(start_time..=end_time) {
            for event_key in event_keys {
                if !is_event_deleted(event_key) {
                    if let Some(event) = events.get(event_key) {
                        if let Ok(decoded_event) = polycentric_common::models::protos::Event::decode(
                            event.event.as_slice(),
                        ) {
                            if decoded_event.content_type == ContentType::Post as i32
                                || decoded_event.content_type == ContentType::Claim as i32
                            {
                                result_events.push(event);
                                if let Some(limit) = limit {
                                    if result_events.len() >= limit {
                                        return result_events;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        result_events
    }

    pub fn global_timeline(&self) -> &BTreeSet<Reverse<TimelineKey>> {
        &self.global_timeline
    }

    pub fn profile_timeline(&self, profile: &SystemKey) -> Option<&BTreeSet<Reverse<TimelineKey>>> {
        self.profile_timelines.get(profile)
    }
}
