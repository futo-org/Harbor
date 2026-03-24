use std::cmp::Reverse;
use std::collections::{BTreeMap, HashSet};

use crate::query::references::ReferencesQueryEngine;
use crate::query::{
    CRDTQuery, CountReferencesQuery, CountReferencesResult, CrdtResolver, CrdtResult,
    EventRangeQuery, EventRangeResult, FeedQuery, FeedQueryEngine, FeedResult, HeadsQueryEngine,
    LatestEventsQuery, LatestEventsResult, MetadataQueryEngine, ProcessHeadsQuery,
    ProcessHeadsResult, ReferencesQuery, ReferencesResult,
};
use crate::store::EventStore;
use polycentric_common::error::CoreError;
use polycentric_common::models::internal::{EventKey, ProcessId, SystemKey, TimelineKey};
use polycentric_common::models::protos::{Event, LwwElement, Pointer, SignedEvent, VectorClock};
use polycentric_common::models::Serializable;
use prost::Message;

/// Query engine for providing access to the event store
#[derive(Debug)]
pub struct QueryEngine {
    pub event_store: EventStore,
    references_engine: ReferencesQueryEngine,
    crdt_resolver: CrdtResolver,
    feed_engine: FeedQueryEngine,
    heads_engine: HeadsQueryEngine,
    metadata_engine: MetadataQueryEngine,
}

impl QueryEngine {
    /// Create a new query engine
    pub fn new() -> Self {
        QueryEngine {
            event_store: EventStore::new(),
            references_engine: ReferencesQueryEngine::new(),
            crdt_resolver: CrdtResolver::new(),
            feed_engine: FeedQueryEngine::new(),
            heads_engine: HeadsQueryEngine::new(),
            metadata_engine: MetadataQueryEngine::new(),
        }
    }

    /// Ingest an event into the store and update all indices
    pub fn ingest_event(&mut self, signed_event: SignedEvent) -> Result<EventKey, CoreError> {
        Event::decode(signed_event.event.as_slice())
            .map_err(|e| CoreError::InvalidEvent(format!("Failed to decode event: {}", e)))?;

        let event_key = self.event_store.ingest_event(signed_event.clone())?;

        Ok(event_key)
    }

    /// Query latest events by content type for a system
    pub fn query_latest(&self, query: LatestEventsQuery) -> Result<LatestEventsResult, CoreError> {
        let events = self
            .event_store
            .get_latest_by_content_type(&query.system, query.content_type);

        let owned_events: Vec<SignedEvent> = events.into_iter().cloned().collect();

        Ok(LatestEventsResult {
            events: owned_events,
        })
    }

    /// Query process heads for a system
    pub fn query_heads(&self, query: ProcessHeadsQuery) -> Result<ProcessHeadsResult, CoreError> {
        self.heads_engine.query_heads(query, &self.event_store)
    }

    /// Query events in a logical clock range
    pub fn query_events(&self, query: EventRangeQuery) -> Result<EventRangeResult, CoreError> {
        let events = self.event_store.get_events_in_range(
            &query.system,
            &query.process,
            query.start_clock,
            query.end_clock,
        );

        let owned_events: Vec<SignedEvent> = events.into_iter().cloned().collect();

        Ok(EventRangeResult {
            events: owned_events,
        })
    }

    /// Query the following feed for a system
    pub fn query_following_feed(
        &self,
        system: &SystemKey,
        limit: usize,
        latest: Option<TimelineKey>,
    ) -> Result<Vec<SignedEvent>, CoreError> {
        let mut feed = vec![];

        let followed_profiles: HashSet<SystemKey> = self
            .query_follows_for_system(system)?
            .into_iter()
            .map(|pk| SystemKey {
                key_type: pk.key_type,
                key: pk.key.clone(),
            })
            .collect();
        let timeline = self.event_store.global_timeline();

        let range = match latest.clone() {
            Some(key) => timeline.range(Reverse(key)..),
            None => timeline.range(..),
        };

        for key in range {
            if feed.len() >= limit {
                break;
            }

            let signed_event = match self.event_store.get_event(&key.0.event_key) {
                Some(evt) => evt,
                None => continue,
            };

            let event = Event::decode(&signed_event.event[..])
                .map_err(|e| CoreError::InvalidEvent(format!("Failed to decode event: {}", e)))?;

            if let Some(latest_timeline_key) = latest.clone() {
                let current_timeline_key = TimelineKey::from_event(&event)?;

                if current_timeline_key == latest_timeline_key {
                    continue;
                }
            }

            let system = match event.system {
                Some(sys) => sys,
                None => continue,
            };

            let system_key = SystemKey {
                key_type: system.key_type,
                key: system.key,
            };

            if !followed_profiles.contains(&system_key) {
                continue;
            }

            feed.push(signed_event.clone());
        }

        Ok(feed)
    }

    pub fn query_opinions_for_system(
        &self,
        system: &SystemKey,
    ) -> Result<BTreeMap<EventKey, LwwElement>, CoreError> {
        let opinions = self.event_store.get_opinions_by_system(system);
        let mut opinons_map = BTreeMap::new();

        for (event_key, signed_events) in opinions {
            let owned_events: Vec<SignedEvent> = signed_events
                .iter()
                .map(|evt| evt.to_owned().to_owned())
                .collect();

            let result = self.crdt_resolver.resolve_lww_element(&owned_events[..])?;

            if let Some(lww) = result {
                opinons_map.insert(event_key, lww);
            }
        }

        Ok(opinons_map)
    }

    /// Query the likes feed for a system
    pub fn query_likes_feed(
        &self,
        system: &SystemKey,
        limit: usize,
        latest: Option<TimelineKey>,
    ) -> Result<Vec<SignedEvent>, CoreError> {
        let mut feed = vec![];

        let opinions = self.query_opinions_for_system(system)?;
        let mut liked_events = HashSet::new();

        for (event_key, lww) in opinions {
            if lww.value[0] == 1 {
                // If opinion is like
                liked_events.insert(event_key);
            }
        }

        let timeline = self.event_store.global_timeline();

        let range = match latest.clone() {
            Some(key) => timeline.range(Reverse(key)..),
            None => timeline.range(..),
        };

        for key in range {
            if feed.len() >= limit {
                break;
            }

            let signed_event = match self.event_store.get_event(&key.0.event_key) {
                Some(evt) => evt,
                None => continue,
            };

            let event = Event::decode(&signed_event.event[..])
                .map_err(|e| CoreError::InvalidEvent(format!("Failed to decode event: {}", e)))?;

            let event_key = EventKey::from_event(&event)?;

            if let Some(latest_timeline_key) = latest.clone() {
                let current_timeline_key = TimelineKey::from_event(&event)?;

                if current_timeline_key == latest_timeline_key {
                    continue;
                }
            }

            if !liked_events.contains(&event_key) {
                continue;
            }

            feed.push(signed_event.clone());
        }

        Ok(feed)
    }

    /// Queries the author feed for a specific system
    pub fn query_author_feed(
        &self,
        system: &SystemKey,
        limit: usize,
        latest: Option<TimelineKey>,
    ) -> Result<Vec<SignedEvent>, CoreError> {
        let mut feed = vec![];

        let timeline_option = self.event_store.profile_timeline(system);

        let timeline = match timeline_option {
            Some(timeline) => timeline,
            None => return Ok(feed),
        };

        let range = match latest.clone() {
            Some(key) => timeline.range(Reverse(key)..),
            None => timeline.range(..),
        };

        for key in range {
            if feed.len() >= limit {
                break;
            }

            let signed_event = match self.event_store.get_event(&key.0.event_key) {
                Some(evt) => evt,
                None => continue,
            };

            let event = Event::decode(&signed_event.event[..])
                .map_err(|e| CoreError::InvalidEvent(format!("Failed to decode event: {}", e)))?;

            if let Some(latest_timeline_key) = latest.clone() {
                let current_timeline_key = TimelineKey::from_event(&event)?;

                if current_timeline_key == latest_timeline_key {
                    continue;
                }
            }

            feed.push(signed_event.clone());
        }

        Ok(feed)
    }

    // Removes deleted events, as well as events from authors that have been blocked by the given system
    pub fn filter_feed(
        &self,
        system: &SystemKey,
        feed: &Vec<SignedEvent>,
    ) -> Result<Vec<SignedEvent>, CoreError> {
        let mut filtered = vec![];

        let blocked_profiles: HashSet<SystemKey> = self
            .query_blocks_for_system(system)?
            .iter()
            .map(SystemKey::from_public_key)
            .collect();

        for signed_event in feed {
            let event = Event::from_bytes(&signed_event.event[..])
                .map_err(|e| CoreError::InvalidEvent(format!("Failed to decode event: {}", e)))?;

            if self.query_is_deleted(&EventKey::from_event(&event)?) {
                continue;
            }

            if let Some(system) = event.system {
                let system_key = SystemKey::from_public_key(&system);
                if blocked_profiles.contains(&system_key) {
                    continue;
                }
            }

            filtered.push(signed_event.to_owned());
        }

        Ok(filtered)
    }

    /// Queries the latest event in the timeline for a given system which is before a given event
    /// (or simply the latest if no event is given)
    pub fn query_next_event_for_system(
        &self,
        system: &SystemKey,
        event_key: Option<TimelineKey>,
    ) -> Result<Option<SignedEvent>, CoreError> {
        let timeline = match self.event_store.profile_timeline(system) {
            Some(timeline) => timeline,
            None => return Ok(None),
        };

        let range = match event_key.clone() {
            Some(key) => timeline.range(Reverse(key)..),
            None => timeline.range(..),
        };

        for item in range {
            let current_key = item.0.clone();

            if let Some(latest_key) = event_key.clone() {
                if latest_key == current_key {
                    continue;
                }
            }

            let event = self.event_store.get_event(&current_key.event_key);

            if let Some(signed_event) = event {
                return Ok(Some(signed_event.clone()));
            }
        }

        Ok(None)
    }

    /// Query feed events for a system
    pub fn query_feed(&self, query: FeedQuery) -> Result<FeedResult, CoreError> {
        self.feed_engine.query_feed(query, &self.event_store)
    }

    /// Query feed events for a system with cursor support (takes raw bytes, returns serialized bytes)
    pub fn query_feed_with_cursor(
        &self,
        system_bytes: &[u8],
        start_time: Option<u64>,
        end_time: Option<u64>,
        limit: Option<usize>,
        cursor: Option<&[u8]>,
    ) -> Result<Vec<u8>, CoreError> {
        self.feed_engine.query_feed_with_cursor(
            system_bytes,
            start_time,
            end_time,
            limit,
            cursor,
            &self.event_store,
        )
    }

    /// Query CRDT value for a system and content type
    pub fn query_crdt(&self, query: CRDTQuery) -> Result<CrdtResult, CoreError> {
        let latest_query = LatestEventsQuery {
            system: query.system.clone(),
            content_type: query.content_type,
        };

        let latest_result = self.query_latest(latest_query)?;

        if latest_result.events.is_empty() {
            return Ok(CrdtResult {
                value: None,
                missing_data: false,
            });
        }

        // Use the CRDT resolver to properly resolve LWW elements
        match self.crdt_resolver.resolve_crdt_value(&latest_result.events) {
            Ok(mut crdt_result) => {
                // Check for missing data by comparing with head events
                let heads_query = ProcessHeadsQuery {
                    system: query.system.clone(),
                };
                let heads_result = self.query_heads(heads_query)?;

                for signed_event in &latest_result.events {
                    if let Ok(event) = Event::decode(signed_event.event.as_slice()) {
                        if let (Some(_system), Some(process)) = (&event.system, &event.process) {
                            let process_id = ProcessId {
                                process: process.process.clone(),
                            };

                            if let Some(head_event) = heads_result.heads.get(&process_id) {
                                if let Ok(head_event_decoded) =
                                    Event::decode(head_event.event.as_slice())
                                {
                                    // If head event has different content type, check indices for missing data
                                    if head_event_decoded.content_type != query.content_type as i32
                                    {
                                        // Look for index pointing to this content type
                                        if let Some(indices) = &head_event_decoded.indices {
                                            for index in &indices.indices {
                                                if index.index_type
                                                    == query.content_type as i32 as u64
                                                    && index.logical_clock != event.logical_clock
                                                {
                                                    crdt_result.missing_data = true;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                Ok(crdt_result)
            }
            Err(e) => Err(CoreError::InvalidEvent(format!(
                "CRDT resolution failed: {}",
                e
            ))),
        }
    }

    /// Query events that reference a specific event
    pub fn query_references(&self, query: ReferencesQuery) -> Result<ReferencesResult, CoreError> {
        self.references_engine
            .query_references(&query, &self.event_store)
            .map_err(|e| CoreError::InvalidEvent(format!("Reference query failed: {}", e)))
    }

    /// Count references to a specific event
    pub fn count_references(
        &self,
        query: CountReferencesQuery,
    ) -> Result<CountReferencesResult, CoreError> {
        self.references_engine
            .count_references(&query, &self.event_store)
            .map_err(|e| CoreError::InvalidEvent(format!("Reference count failed: {}", e)))
    }

    /// Query the current opinion for a target event using CRDT resolution
    pub fn query_current_opinion(
        &self,
        target: &EventKey,
    ) -> Result<Option<LwwElement>, CoreError> {
        let opinion_events = self.event_store.get_opinions_for_target(target);

        if opinion_events.is_empty() {
            return Ok(None);
        }

        let owned_opinion_events: Vec<SignedEvent> = opinion_events.into_iter().cloned().collect();

        self.crdt_resolver
            .resolve_lww_element(&owned_opinion_events)
    }

    /// Query the current opinion for a target event by the current user's system
    pub fn query_opinion(
        &self,
        current_system: &SystemKey,
        target_pointer: &Pointer,
    ) -> Result<Option<LwwElement>, CoreError> {
        let target_event_key = self.get_reference(target_pointer)?;
        let target_event_key = target_event_key
            .ok_or_else(|| CoreError::InvalidEvent("Target event not found".to_string()))?;

        let opinion_events_refs = self
            .event_store
            .get_opinions_for_target_by_system(&target_event_key, current_system);

        if opinion_events_refs.is_empty() {
            return Ok(None);
        }

        let opinion_events: Vec<SignedEvent> = opinion_events_refs.into_iter().cloned().collect();

        self.crdt_resolver.resolve_lww_element(&opinion_events)
    }

    /// Query the deletion status for a target event
    pub fn query_is_deleted(&self, target: &EventKey) -> bool {
        self.event_store.is_event_deleted(target)
    }

    /// Get the next logical clock for a process
    pub fn get_next_logical_clock(&self, system: &SystemKey, process_id: &ProcessId) -> u64 {
        let process_states = self.event_store.get_process_heads(system);

        if let Some(process_state) = process_states.get(process_id) {
            process_state.logical_clock + 1
        } else {
            1 // First event for this process
        }
    }

    /// Get reference to the reference query engine for debugging
    pub fn get_reference_query_engine(&self) -> &ReferencesQueryEngine {
        &self.references_engine
    }

    /// Get a reference for a pointer
    pub fn get_reference(&self, pointer: &Pointer) -> Result<Option<EventKey>, CoreError> {
        self.references_engine
            .get_reference_by_pointer(pointer)
            .map_err(|e| CoreError::InvalidEvent(format!("Failed to get reference: {}", e)))
    }

    /// Query CRDT value for a specific system and content type (system-specific LWW elements)
    /// This method is for LWW elements that belong to a specific system (username, description, avatar, etc.)
    /// Unlike query_crdt which can aggregate across systems, this only queries the specified system
    pub fn query_crdt_for_system(
        &self,
        system: &SystemKey,
        content_type: polycentric_common::models::protos::ContentType,
    ) -> Result<Option<LwwElement>, CoreError> {
        let latest_query = LatestEventsQuery {
            system: system.clone(),
            content_type,
        };

        let latest_result = self.query_latest(latest_query)?;

        if latest_result.events.is_empty() {
            return Ok(None);
        }

        // Use the CRDT resolver to properly resolve LWW elements
        match self
            .crdt_resolver
            .resolve_lww_element(&latest_result.events)
        {
            Ok(lww_element) => Ok(lww_element),
            Err(e) => Err(CoreError::InvalidEvent(format!(
                "CRDT resolution failed: {}",
                e
            ))),
        }
    }

    /// Query LWW element set for follows by a system
    pub fn query_follows_for_system(
        &self,
        system: &SystemKey,
    ) -> Result<Vec<polycentric_common::models::protos::PublicKey>, CoreError> {
        self.metadata_engine
            .query_follows_for_system(system, &self.event_store)
    }

    /// Query LWW element set for blocks by a system
    pub fn query_blocks_for_system(
        &self,
        system: &SystemKey,
    ) -> Result<Vec<polycentric_common::models::protos::PublicKey>, CoreError> {
        self.metadata_engine
            .query_blocks_for_system(system, &self.event_store)
    }

    /// Query LWW element set for servers by a system
    pub fn query_servers_for_system(&self, system: &SystemKey) -> Result<Vec<String>, CoreError> {
        self.metadata_engine
            .query_servers_for_system(system, &self.event_store)
    }

    /// Query LWW element set for authorities by a system
    pub fn query_authorities_for_system(
        &self,
        system: &SystemKey,
    ) -> Result<Vec<String>, CoreError> {
        self.metadata_engine
            .query_authorities_for_system(system, &self.event_store)
    }

    /// Query LWW element set for topics by a system
    pub fn query_topics_for_system(&self, system: &SystemKey) -> Result<Vec<String>, CoreError> {
        self.metadata_engine
            .query_topics_for_system(system, &self.event_store)
    }

    /// Get the winning SignedEvents for LWW element set (follows)
    pub fn get_lww_follows_for_system(&self, system: &SystemKey) -> Vec<SignedEvent> {
        self.metadata_engine
            .get_lww_follows_for_system(system, &self.event_store)
    }

    /// Get the winning SignedEvents for LWW element set (blocks)
    pub fn get_lww_blocks_for_system(&self, system: &SystemKey) -> Vec<SignedEvent> {
        self.metadata_engine
            .get_lww_blocks_for_system(system, &self.event_store)
    }

    /// Get the winning SignedEvents for LWW element set (servers)
    pub fn get_lww_servers_for_system(&self, system: &SystemKey) -> Vec<SignedEvent> {
        self.metadata_engine
            .get_lww_servers_for_system(system, &self.event_store)
    }

    /// Get the winning SignedEvents for LWW element set (authorities)
    pub fn get_lww_authorities_for_system(&self, system: &SystemKey) -> Vec<SignedEvent> {
        self.metadata_engine
            .get_lww_authorities_for_system(system, &self.event_store)
    }

    /// Get the winning SignedEvents for LWW element set (topics)
    pub fn get_lww_topics_for_system(&self, system: &SystemKey) -> Vec<SignedEvent> {
        self.metadata_engine
            .get_lww_topics_for_system(system, &self.event_store)
    }

    /// Compute vector clock for a new event based on current system state
    #[allow(clippy::type_complexity)]
    pub fn compute_vector_clock(
        &self,
        system_bytes: &[u8],
        process_bytes: &[u8],
        get_next_logical_clock: &dyn Fn(&[u8], &[u8]) -> Result<u64, CoreError>,
    ) -> Result<VectorClock, CoreError> {
        let system_key = self.parse_system_key(system_bytes)?;
        let process_id = ProcessId {
            process: process_bytes.to_vec(),
        };

        let heads_query = ProcessHeadsQuery {
            system: system_key.clone(),
        };
        let heads_result = self.query_heads(heads_query)?;

        // Collect all processes (including current) and sort deterministically
        let mut all_processes: Vec<ProcessId> = heads_result.heads.keys().cloned().collect();

        // Ensure current process is included
        if !all_processes
            .iter()
            .any(|p| p.process == process_id.process)
        {
            all_processes.push(process_id.clone());
        }

        // Sort processes deterministically by their process bytes
        all_processes.sort_by(|a, b| a.process.cmp(&b.process));

        let mut logical_clocks = Vec::new();

        // Build vector clock in deterministic order
        for process in &all_processes {
            if process.process == process_id.process {
                // Current process gets next logical clock
                let current_logical_clock = get_next_logical_clock(system_bytes, process_bytes)?;
                logical_clocks.push(current_logical_clock);
            } else {
                // Other processes get their head logical clock
                if let Some(signed_event) = heads_result.heads.get(process) {
                    if let Ok(event) = Event::decode(signed_event.event.as_slice()) {
                        logical_clocks.push(event.logical_clock);
                    } else {
                        logical_clocks.push(0); // Default if decode fails
                    }
                } else {
                    logical_clocks.push(0); // Default if no head found
                }
            }
        }

        Ok(VectorClock { logical_clocks })
    }

    /// Parse system key from bytes
    pub fn parse_system_key(&self, system_bytes: &[u8]) -> Result<SystemKey, CoreError> {
        let public_key = polycentric_common::models::protos::PublicKey::decode(system_bytes)
            .map_err(|e| CoreError::InvalidEvent(format!("Failed to decode system key: {}", e)))?;
        Ok(SystemKey::from_public_key(&public_key))
    }

    /// Create EventKey from system bytes, process bytes, and logical clock
    pub fn create_event_key(
        &self,
        system_bytes: &[u8],
        process_bytes: &[u8],
        logical_clock: u64,
    ) -> Result<EventKey, CoreError> {
        let system_key = self.parse_system_key(system_bytes)?;
        let process_id = ProcessId {
            process: process_bytes.to_vec(),
        };

        Ok(EventKey {
            system_key_type: system_key.key_type,
            system_key: system_key.key,
            process: process_id.process,
            logical_clock,
        })
    }
}

impl Default for QueryEngine {
    fn default() -> Self {
        Self::new()
    }
}
