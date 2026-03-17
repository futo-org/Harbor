use crate::error::{Error, Result};
use crate::models::internal::EventKey as InternalEventKey;
use crate::models::protos::Reference;
use crate::models::traits::Serializable;
use crate::platform::error::PlatformError;
use prost::Message;

impl Reference {
    /// Creates a new reference with the given type and reference data
    pub fn new(reference_type: u64, reference: Vec<u8>) -> Self {
        Self {
            reference_type,
            reference,
        }
    }

    /// Gets the reference type
    pub fn reference_type(&self) -> u64 {
        self.reference_type
    }

    /// Gets the reference data
    pub fn reference(&self) -> &[u8] {
        &self.reference
    }

    /// Gets a slice of the reference data
    pub fn reference_slice(&self, start: usize, end: usize) -> Result<&[u8]> {
        if start > end || end > self.reference.len() {
            return Err(Error::Platform(PlatformError::DeserializationError(
                format!(
                    "Invalid slice range: start={}, end={}, len={}",
                    start,
                    end,
                    self.reference.len()
                ),
            )));
        }
        Ok(&self.reference[start..end])
    }

    /// Gets a copy of the reference data
    pub fn reference_cloned(&self) -> Vec<u8> {
        self.reference.to_vec()
    }

    /// Gets the reference data as a hex string
    pub fn reference_as_hex(&self) -> String {
        self.reference
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect::<Vec<String>>()
            .join("")
    }

    /// Sets the reference type
    pub fn set_reference_type(&mut self, reference_type: u64) {
        self.reference_type = reference_type;
    }

    /// Sets the reference data
    pub fn set_reference(&mut self, reference: Vec<u8>) {
        self.reference = reference;
    }

    /// Validates that the reference data has the expected length
    pub fn validate_length(&self, expected: usize) -> Result<()> {
        if self.reference.len() != expected {
            return Err(Error::Platform(PlatformError::DeserializationError(
                format!(
                    "Invalid reference length: expected {}, got {}",
                    expected,
                    self.reference.len()
                ),
            )));
        }
        Ok(())
    }

    /// Checks if this reference has the same type as another
    pub fn has_same_type(&self, other: &Self) -> bool {
        self.reference_type == other.reference_type
    }

    /// Checks if this reference has the same data as another
    pub fn has_same_data(&self, other: &Self) -> bool {
        self.reference == other.reference
    }

    /// Checks if this reference is equal to another
    pub fn equals(&self, other: &Self) -> bool {
        self.has_same_type(other) && self.has_same_data(other)
    }

    /// Checks if the reference data is empty
    pub fn is_empty(&self) -> bool {
        self.reference.is_empty()
    }

    /// Returns the length of the reference data
    pub fn len(&self) -> usize {
        self.reference.len()
    }

    /// Parse this reference and return the target event key if valid
    /// otherwise return None
    pub fn to_event_key(&self) -> Option<InternalEventKey> {
        if self.reference_type != 2 {
            return None;
        }

        let pointer = crate::models::protos::Pointer::decode(self.reference.as_slice()).ok()?;
        let system = pointer.system?;
        let process = pointer.process?;

        Some(InternalEventKey {
            system_key_type: system.key_type,
            system_key: system.key,
            process: process.process,
            logical_clock: pointer.logical_clock,
        })
    }
}

impl Serializable for Reference {
    fn to_bytes(&self) -> Result<Vec<u8>> {
        let mut buf = Vec::new();
        self.encode(&mut buf)
            .map_err(|e| Error::Platform(PlatformError::SerializationError(e.to_string())))?;
        Ok(buf)
    }

    fn from_bytes(bytes: &[u8]) -> Result<Self> {
        Reference::decode(bytes)
            .map_err(|e| Error::Platform(PlatformError::DeserializationError(e.to_string())))
    }
}
