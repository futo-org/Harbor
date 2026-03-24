use crate::error::CoreError;
use crate::models::protos::{ContentType, Event, Process, PublicKey, SignedEvent};
use prost::Message;

/// A unique identifier for an event within the system
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct EventKey {
    pub system_key_type: u64,
    pub system_key: Vec<u8>,
    pub process: Vec<u8>,
    pub logical_clock: u64,
}

impl EventKey {
    pub fn from_event(event: &Event) -> Result<Self, CoreError> {
        let system = event
            .system
            .as_ref()
            .ok_or_else(|| CoreError::InvalidEvent("Missing system".to_string()))?;
        let process = event
            .process
            .as_ref()
            .ok_or_else(|| CoreError::InvalidEvent("Missing process".to_string()))?;

        Ok(EventKey {
            system_key_type: system.key_type,
            system_key: system.key.clone(),
            process: process.process.clone(),
            logical_clock: event.logical_clock,
        })
    }

    pub fn from_signed_event(signed_event: &SignedEvent) -> Result<Self, CoreError> {
        let event = Event::decode(signed_event.event.as_slice())
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

        if let Some(unix_timestamp) = event.unix_milliseconds {
            Ok(TimelineKey {
                timestamp: unix_timestamp,
                event_key,
            })
        } else {
            Err(CoreError::InvalidEvent(
                "Missing unix timestamp".to_string(),
            ))
        }
    }
}

/// A pointer to an event in storage
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventPointer {
    pub key: EventKey,
    pub unix_milliseconds: u64,
    pub content_type: ContentType,
}

/// System identifier for indexing
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SystemKey {
    pub key_type: u64,
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

/// Process identifier
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ProcessId {
    pub process: Vec<u8>,
}

impl ProcessId {
    pub fn from_process(process: &Process) -> Self {
        ProcessId {
            process: process.process.clone(),
        }
    }
}
