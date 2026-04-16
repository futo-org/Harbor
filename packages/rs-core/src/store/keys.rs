use polycentric_common::error::CoreError;
use polycentric_common::models::protos_v2::{Event, SignedEvent};
use prost::Message;

/// A unique identifier for an event.
///
/// Field order determines BTreeMap sort order:
/// `(identity, collection, signed_by_key_type, signed_by_key, sequence)`.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct EventKey {
    pub identity: String,
    pub collection: i32,
    pub signed_by_key_type: i32,
    pub signed_by_key: Vec<u8>,
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
            identity: key.identity.clone(),
            collection: key.collection,
            signed_by_key_type: signed_by.key_type,
            signed_by_key: signed_by.key.clone(),
            sequence: key.sequence,
        })
    }

    pub fn from_signed_event(signed_event: &SignedEvent) -> Result<Self, CoreError> {
        let event = Event::decode(signed_event.event_bytes.as_slice())
            .map_err(|e| CoreError::InvalidEvent(format!("Failed to decode event: {}", e)))?;
        Self::from_event(&event)
    }
}
