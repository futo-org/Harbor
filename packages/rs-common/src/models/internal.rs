use crate::error::CoreError;
use crate::models::protos_v2::{Event, EventKey as ProtoEventKey, PublicKey};
use prost::Message;

use super::protos_v2::SignedEvent;

/// A unique identifier for an event within the system
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct EventKey {
    pub collection: i32,
    pub identity: String,
    pub system_key_type: i32,
    pub system_key: Vec<u8>,
    pub sequence: u64,
}

impl EventKey {
    pub fn from_event(event: &Event) -> Result<Self, CoreError> {
        let key = event
            .key
            .as_ref()
            .ok_or_else(|| CoreError::InvalidEvent("Missing key".to_string()))?;
        let signed_by = key
            .signed_by
            .as_ref()
            .ok_or_else(|| CoreError::InvalidEvent("Missing signed_by".to_string()))?;

        Ok(EventKey {
            collection: key.collection,
            identity: key.identity.clone(),
            system_key_type: signed_by.key_type,
            system_key: signed_by.key.clone(),
            sequence: key.sequence,
        })
    }

    pub fn from_signed_event(signed_event: &SignedEvent) -> Result<Self, CoreError> {
        let event = Event::decode(signed_event.event_bytes.as_slice())
            .map_err(|e| CoreError::InvalidEvent(format!("Failed to decode event: {}", e)))?;
        Self::from_event(&event)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct TimelineKey {
    pub timestamp: u64,
    pub event_key: EventKey,
}

impl TimelineKey {
    pub fn from_event(event: &Event) -> Result<Self, CoreError> {
        let event_key = EventKey::from_event(event)?;
        Ok(TimelineKey {
            timestamp: event.created_at,
            event_key,
        })
    }
}

/// A pointer to an event in storage
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventPointer {
    pub key: EventKey,
    pub created_at: u64,
}

/// System identifier for indexing
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SystemKey {
    pub key_type: i32,
    pub key: Vec<u8>,
}

impl SystemKey {
    pub fn from_public_key(public_key: &PublicKey) -> Self {
        SystemKey {
            key_type: public_key.key_type,
            key: public_key.key.clone(),
        }
    }
}

/// Process identifier (collection + identity from EventKey)
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ProcessId {
    pub collection: i32,
    pub identity: String,
}

impl ProcessId {
    pub fn from_event_key(key: &ProtoEventKey) -> Self {
        ProcessId {
            collection: key.collection,
            identity: key.identity.clone(),
        }
    }
}
