use crate::error::{Error, Result};
use crate::models::protos::{Events as EventArray, SignedEvent};
use crate::models::traits::Serializable;
use prost::Message;

impl Serializable for EventArray {
    fn to_bytes(&self) -> Result<Vec<u8>> {
        let mut buf = Vec::new();
        self.encode(&mut buf).map_err(|e| {
            Error::Platform(crate::platform::error::PlatformError::SerializationError(
                e.to_string(),
            ))
        })?;
        Ok(buf)
    }

    fn from_bytes(bytes: &[u8]) -> Result<Self> {
        EventArray::decode(bytes).map_err(|e| {
            Error::Platform(crate::platform::error::PlatformError::DeserializationError(
                e.to_string(),
            ))
        })
    }
}

pub fn serialize_signed_events(events: &[SignedEvent]) -> Vec<u8> {
    let events_proto = EventArray {
        events: events.to_vec(),
    };
    events_proto.to_bytes().unwrap_or_default()
}
