//! [`EventKey`], the ordered key used by every local store.

use polycentric_common::error::CoreError;
use polycentric_common::models::protos_v2::{self, Event, SignedEvent};
use prost::Message;

/// A unique identifier for an event.
///
/// Field order determines BTreeMap sort order:
/// `(identity, collection, signed_by_key_type, signed_by_key, sequence)`.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct EventKey {
    /// Author identity.
    pub identity: String,
    /// Collection the event belongs to (see `polycentric_common::models::collections`).
    pub collection: i32,
    /// `PublicKey.key_type` of the signer.
    pub signed_by_key_type: i32,
    /// `PublicKey.key` bytes of the signer.
    pub signed_by_key: Vec<u8>,
    /// Per-(identity, collection, signer) sequence number.
    pub sequence: u64,
}

impl EventKey {
    /// Convert a proto `EventKey`. Errors if `signed_by` is missing.
    pub fn from_proto_key(key: protos_v2::EventKey) -> Result<Self, CoreError> {
        let signed_by = key
            .signed_by
            .ok_or_else(|| CoreError::InvalidEvent("Missing signed_by".to_string()))?;

        Ok(EventKey {
            identity: key.identity,
            collection: key.collection,
            signed_by_key_type: signed_by.key_type,
            signed_by_key: signed_by.key,
            sequence: key.sequence,
        })
    }

    /// Key of a decoded `Event`. Errors if the event has no key.
    pub fn from_event(event: Event) -> Result<Self, CoreError> {
        let key = event
            .key
            .ok_or_else(|| CoreError::InvalidEvent("Missing key".to_string()))?;

        Self::from_proto_key(key)
    }

    /// Decode the event inside `signed_event` and take its key. Does not
    /// verify the signature.
    pub fn from_signed_event(signed_event: &SignedEvent) -> Result<Self, CoreError> {
        let event = Event::decode(signed_event.event_bytes.as_slice())
            .map_err(|e| CoreError::InvalidEvent(format!("Failed to decode event: {}", e)))?;

        Self::from_event(event)
    }
}
