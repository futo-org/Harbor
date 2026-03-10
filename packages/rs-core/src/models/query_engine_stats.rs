use crate::error::{Error, Result};
use crate::models::protos::QueryEngineStats;
use crate::models::traits::Serializable;
use prost::Message;

impl QueryEngineStats {
    pub fn new(total_events: u64, system_count: u64, process_count: u64) -> Self {
        Self {
            total_events,
            system_count,
            process_count,
            memory_usage: None,
        }
    }
}

impl Serializable for QueryEngineStats {
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
        QueryEngineStats::decode(bytes).map_err(|e| {
            Error::Platform(crate::platform::error::PlatformError::DeserializationError(
                e.to_string(),
            ))
        })
    }
}
