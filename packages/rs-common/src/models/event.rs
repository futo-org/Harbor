use std::collections::HashMap;

use crate::error::{Error, Result};
use super::protos_v2::{Event, EventKey, ContentDigest, VectorClock};
use crate::models::traits::Serializable;
use crate::platform::error::PlatformError;
use prost::Message;

impl Event {
    /// Creates a new event with the given parameters
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        key: EventKey,
        vector_clocks: HashMap<i32, VectorClock>,
        previous_signature: Vec<u8>,
        content_digest: Option<ContentDigest>,
        created_at: u64,
    ) -> Self {
        Self {
            key: Some(key),
            vector_clocks,
            previous_signature,
            content_digest,
            created_at,
        }
    }


    /// Validates that the event has all required fields
    pub fn validate(&self) -> Result<()> {
        // if self.system.is_none() {
        //     return Err(Error::Platform(PlatformError::DeserializationError(
        //         "Event missing system".to_string(),
        //     )));
        // }
        // if self.process.is_none() {
        //     return Err(Error::Platform(PlatformError::DeserializationError(
        //         "Event missing process".to_string(),
        //     )));
        // }
        // if self.vector_clock.is_none() {
        //     return Err(Error::Platform(PlatformError::DeserializationError(
        //         "Event missing vector clock".to_string(),
        //     )));
        // }
        // if self.unix_milliseconds.is_none() {
        //     return Err(Error::Platform(PlatformError::DeserializationError(
        //         "Event missing unix_milliseconds".to_string(),
        //     )));
        // }
        Ok(())
    }
}

impl Serializable for Event {
    fn to_bytes(&self) -> Result<Vec<u8>> {
        let mut buf = Vec::new();
        self.encode(&mut buf)
            .map_err(|e| Error::Platform(PlatformError::SerializationError(e.to_string())))?;
        Ok(buf)
    }

    fn from_bytes(bytes: &[u8]) -> Result<Self> {
        Event::decode(bytes)
            .map_err(|e| Error::Platform(PlatformError::DeserializationError(e.to_string())))
    }
}
