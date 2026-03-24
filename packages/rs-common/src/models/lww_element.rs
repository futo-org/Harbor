use crate::error::{Error, Result};
use crate::models::protos::LwwElement;
use crate::models::traits::Serializable;
use crate::platform::error::PlatformError;
use prost::Message;
use std::time::{SystemTime, UNIX_EPOCH};

impl LwwElement {
    /// Gets the value data
    pub fn value(&self) -> &[u8] {
        &self.value
    }

    /// Gets the Unix timestamp in milliseconds
    pub fn unix_milliseconds(&self) -> u64 {
        self.unix_milliseconds
    }

    /// Creates a new LWW element with the given value and timestamp
    pub fn new(value: Vec<u8>, unix_milliseconds: u64) -> Self {
        Self {
            value,
            unix_milliseconds,
        }
    }

    /// Gets the value as a string if it's valid UTF-8
    pub fn value_as_str(&self) -> Result<&str> {
        std::str::from_utf8(&self.value).map_err(|e| {
            Error::Platform(PlatformError::DeserializationError(format!(
                "Value is not valid UTF-8: {}",
                e
            )))
        })
    }

    /// Gets the value as a hex string
    pub fn value_as_hex(&self) -> String {
        self.value
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect::<Vec<String>>()
            .join("")
    }

    /// Checks if the value is empty
    pub fn is_empty(&self) -> bool {
        self.value.is_empty()
    }

    /// Gets the length of the value
    pub fn len(&self) -> usize {
        self.value.len()
    }

    /// Checks if the timestamp is valid (not 0)
    pub fn is_valid_timestamp(&self) -> bool {
        self.unix_milliseconds != 0
    }

    /// Gets the age of the element in milliseconds
    pub fn age_milliseconds(&self) -> Result<u64> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| {
                Error::Platform(PlatformError::DeserializationError(format!(
                    "Failed to get current time: {}",
                    e
                )))
            })?
            .as_millis() as u64;
        Ok(now.saturating_sub(self.unix_milliseconds))
    }

    /// Merges two LWW elements, taking the one with the later timestamp
    pub fn merge(&self, other: &Self) -> Self {
        if self.unix_milliseconds >= other.unix_milliseconds {
            self.clone()
        } else {
            other.clone()
        }
    }

    /// Checks if this LWW element is newer than another based on timestamp
    pub fn is_newer_than(&self, other: &Self) -> bool {
        self.unix_milliseconds > other.unix_milliseconds
    }
}

impl Serializable for LwwElement {
    fn to_bytes(&self) -> Result<Vec<u8>> {
        let mut buf = Vec::new();
        self.encode(&mut buf)
            .map_err(|e| Error::Platform(PlatformError::SerializationError(e.to_string())))?;
        Ok(buf)
    }

    fn from_bytes(bytes: &[u8]) -> Result<Self> {
        LwwElement::decode(bytes)
            .map_err(|e| Error::Platform(PlatformError::DeserializationError(e.to_string())))
    }
}
