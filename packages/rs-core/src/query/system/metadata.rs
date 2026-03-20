use crate::query::crdt::CrdtResolver;
use crate::store::EventStore;
use polycentric_common::error::CoreError;
use polycentric_common::models::internal::SystemKey;
use polycentric_common::models::protos::{ContentType, SignedEvent};
use prost::Message;

/// System metadata query engine for handling system metadata queries
#[derive(Debug)]
pub struct MetadataQueryEngine {
    crdt_resolver: CrdtResolver,
}

impl MetadataQueryEngine {
    /// Create a new metadata query engine
    pub fn new() -> Self {
        Self {
            crdt_resolver: CrdtResolver::new(),
        }
    }

    /// Generic method to query LWW element set for any content type
    fn query_lww_element_set<T, F>(
        &self,
        system: &SystemKey,
        content_type: ContentType,
        event_store: &EventStore,
        decoder: F,
    ) -> Result<Vec<T>, CoreError>
    where
        F: Fn(&[u8]) -> Result<T, Box<dyn std::error::Error + Send + Sync>>,
    {
        let events = event_store.get_all_by_content_type(system, content_type);

        if events.is_empty() {
            return Ok(Vec::new());
        }

        let signed_events: Vec<SignedEvent> = events.into_iter().cloned().collect();

        let final_elements = self
            .crdt_resolver
            .get_final_lww_element_set(&signed_events)?;

        let mut results = Vec::new();
        for element_value in final_elements {
            if let Ok(item) = decoder(element_value.as_slice()) {
                results.push(item);
            }
        }

        Ok(results)
    }

    /// Query LWW element set for follows by a system
    pub fn query_follows_for_system(
        &self,
        system: &SystemKey,
        event_store: &EventStore,
    ) -> Result<Vec<polycentric_common::models::protos::PublicKey>, CoreError> {
        self.query_lww_element_set(system, ContentType::Follow, event_store, |bytes| {
            polycentric_common::models::protos::PublicKey::decode(bytes)
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)
        })
    }

    /// Query LWW element set for blocks by a system
    pub fn query_blocks_for_system(
        &self,
        system: &SystemKey,
        event_store: &EventStore,
    ) -> Result<Vec<polycentric_common::models::protos::PublicKey>, CoreError> {
        self.query_lww_element_set(system, ContentType::Block, event_store, |bytes| {
            polycentric_common::models::protos::PublicKey::decode(bytes)
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)
        })
    }

    /// Query LWW element set for servers by a system
    pub fn query_servers_for_system(
        &self,
        system: &SystemKey,
        event_store: &EventStore,
    ) -> Result<Vec<String>, CoreError> {
        self.query_lww_element_set(system, ContentType::Server, event_store, |bytes| {
            String::from_utf8(bytes.to_vec())
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)
        })
    }

    /// Query LWW element set for authorities by a system
    pub fn query_authorities_for_system(
        &self,
        system: &SystemKey,
        event_store: &EventStore,
    ) -> Result<Vec<String>, CoreError> {
        self.query_lww_element_set(system, ContentType::Authority, event_store, |bytes| {
            String::from_utf8(bytes.to_vec())
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)
        })
    }

    /// Query LWW element set for topics by a system
    pub fn query_topics_for_system(
        &self,
        system: &SystemKey,
        event_store: &EventStore,
    ) -> Result<Vec<String>, CoreError> {
        self.query_lww_element_set(system, ContentType::JoinTopic, event_store, |bytes| {
            String::from_utf8(bytes.to_vec())
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)
        })
    }

    /// Get the winning SignedEvents for LWW element set (follows)
    pub fn get_lww_follows_for_system(
        &self,
        system: &SystemKey,
        event_store: &EventStore,
    ) -> Vec<SignedEvent> {
        self.get_lww_element_set_events(system, ContentType::Follow, event_store)
    }

    /// Get the winning SignedEvents for LWW element set (blocks)
    pub fn get_lww_blocks_for_system(
        &self,
        system: &SystemKey,
        event_store: &EventStore,
    ) -> Vec<SignedEvent> {
        self.get_lww_element_set_events(system, ContentType::Block, event_store)
    }

    /// Get the winning SignedEvents for LWW element set (servers)
    pub fn get_lww_servers_for_system(
        &self,
        system: &SystemKey,
        event_store: &EventStore,
    ) -> Vec<SignedEvent> {
        self.get_lww_element_set_events(system, ContentType::Server, event_store)
    }

    /// Get the winning SignedEvents for LWW element set (authorities)
    pub fn get_lww_authorities_for_system(
        &self,
        system: &SystemKey,
        event_store: &EventStore,
    ) -> Vec<SignedEvent> {
        self.get_lww_element_set_events(system, ContentType::Authority, event_store)
    }

    /// Get the winning SignedEvents for LWW element set (topics)
    pub fn get_lww_topics_for_system(
        &self,
        system: &SystemKey,
        event_store: &EventStore,
    ) -> Vec<SignedEvent> {
        self.get_lww_element_set_events(system, ContentType::JoinTopic, event_store)
    }

    /// Generic helper for LWW element set event resolution
    fn get_lww_element_set_events(
        &self,
        system: &SystemKey,
        content_type: ContentType,
        event_store: &EventStore,
    ) -> Vec<SignedEvent> {
        let events = event_store.get_all_by_content_type(system, content_type);
        if events.is_empty() {
            return Vec::new();
        }

        let mut element_map: std::collections::HashMap<
            Vec<u8>,
            (
                u64,
                u64,
                usize,
                polycentric_common::models::protos::lww_element_set::Operation,
            ),
        > = std::collections::HashMap::new();

        for (idx, signed_event) in events.iter().enumerate() {
            if let Ok(event) =
                polycentric_common::models::protos::Event::decode(signed_event.event.as_slice())
            {
                if let Some(lww_element_set) = &event.lww_element_set {
                    let key = lww_element_set.value.clone();
                    let timestamp = lww_element_set.unix_milliseconds;
                    let logical_clock = event.logical_clock;
                    let operation =
                        polycentric_common::models::protos::lww_element_set::Operation::try_from(
                            lww_element_set.operation,
                        )
                        .unwrap_or(
                            polycentric_common::models::protos::lww_element_set::Operation::Add,
                        );
                    match element_map.get(&key) {
                        Some((existing_timestamp, existing_logical_clock, _, _)) => {
                            if (timestamp, logical_clock)
                                > (*existing_timestamp, *existing_logical_clock)
                            {
                                element_map.insert(key, (timestamp, logical_clock, idx, operation));
                            }
                        }
                        None => {
                            element_map.insert(key, (timestamp, logical_clock, idx, operation));
                        }
                    }
                }
            }
        }

        let mut winning_events = Vec::new();
        for (_, (_, _, idx, operation)) in element_map {
            if operation == polycentric_common::models::protos::lww_element_set::Operation::Add {
                if let Some(event) = events.get(idx) {
                    winning_events.push((*event).clone());
                }
            }
        }

        winning_events
    }
}

impl Default for MetadataQueryEngine {
    fn default() -> Self {
        Self::new()
    }
}
