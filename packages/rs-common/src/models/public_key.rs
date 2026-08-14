use crate::error::{Error, Result};
use crate::models::protos_v2::PublicKey;
use crate::models::traits::Serializable;
use crate::platform::error::PlatformError;
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use prost::Message;
use std::fmt;

impl PublicKey {
    /// Gets the raw key bytes
    pub fn key(&self) -> &[u8] {
        &self.key
    }

    /// Gets a copy of the key bytes
    pub fn key_cloned(&self) -> Vec<u8> {
        self.key.to_vec()
    }

    /// Gets the key as a hex string
    pub fn key_as_hex(&self) -> String {
        hex::encode(self.key())
    }

    /// Validates that the key has the expected length
    pub fn validate_length(&self, expected: usize) -> Result<()> {
        if self.key.len() != expected {
            return Err(Error::Platform(PlatformError::KeyIncorrectLength {
                expected,
                actual: self.key.len(),
            }));
        }
        Ok(())
    }

    /// Validates that the key type is correct
    pub fn validate_type(&self, _expected: u64) -> Result<()> {
        // TODO: re-enable once `key_type` width settles between v1 (u64) and v2 (i32).
        // if self.key_type != expected {
        //     return Err(Error::Platform(PlatformError::KeyInvalidType {
        //         expected,
        //         actual: self.key_type,
        //     }));
        // }
        Ok(())
    }

    /// Checks if this key is equal to another
    pub fn equals(&self, other: &Self) -> bool {
        self.key == other.key && self.key_type == other.key_type
    }

    /// Checks if the key is empty
    pub fn is_empty(&self) -> bool {
        self.key.is_empty()
    }

    /// Returns the length of the key
    pub fn len(&self) -> usize {
        self.key.len()
    }
}

impl Serializable for PublicKey {
    fn to_bytes(&self) -> Result<Vec<u8>> {
        let mut buf = Vec::new();
        self.encode(&mut buf)
            .map_err(|e| Error::Platform(PlatformError::SerializationError(e.to_string())))?;
        Ok(buf)
    }

    fn from_bytes(bytes: &[u8]) -> Result<Self> {
        PublicKey::decode(bytes)
            .map_err(|e| Error::Platform(PlatformError::DeserializationError(e.to_string())))
    }
}

impl fmt::Debug for PublicKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let PublicKey { key_type, key } = self;
        f.debug_struct("PublicKey")
            .field("key_type", key_type)
            .field("key", &URL_SAFE_NO_PAD.encode(key))
            .finish()
    }
}
