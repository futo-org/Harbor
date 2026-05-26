use super::protos_v2::{EventKey, PublicKey};
use crate::error::{Error, Result};
use crate::models::traits::Serializable;
use crate::platform::error::PlatformError;
use prost::Message;

impl EventKey {
    pub fn new(collection: i32, identity: String, signed_by: PublicKey, sequence: u64) -> Self {
        Self {
            collection,
            identity,
            signed_by: Some(signed_by),
            sequence,
        }
    }

    pub fn validate(&self) -> Result<()> {
        if self.identity.is_empty() {
            return Err(Error::Platform(PlatformError::SerializationError(
                "EventKey.identity is empty".to_string(),
            )));
        }
        if self.signed_by.is_none() {
            return Err(Error::Platform(PlatformError::SerializationError(
                "EventKey.signed_by is missing".to_string(),
            )));
        }
        Ok(())
    }
}

impl Serializable for EventKey {
    fn to_bytes(&self) -> Result<Vec<u8>> {
        let mut buf = Vec::new();
        self.encode(&mut buf)
            .map_err(|e| Error::Platform(PlatformError::SerializationError(e.to_string())))?;
        Ok(buf)
    }

    fn from_bytes(bytes: &[u8]) -> Result<Self> {
        EventKey::decode(bytes)
            .map_err(|e| Error::Platform(PlatformError::DeserializationError(e.to_string())))
    }
}
