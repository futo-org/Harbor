use crate::error::{Error, Result};
use crate::models::protos::Process;
use crate::models::traits::Serializable;
use crate::platform::error::PlatformError;
use prost::Message;

impl Process {
    /// Gets the process ID bytes
    pub fn id(&self) -> &[u8] {
        &self.process
    }

    /// Gets a copy of the process ID bytes
    pub fn id_cloned(&self) -> Vec<u8> {
        self.process.to_vec()
    }

    /// Gets the process ID as a hex string
    pub fn id_as_hex(&self) -> String {
        self.process
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect::<Vec<String>>()
            .join("")
    }

    /// Validates that the process ID has the expected length
    pub fn validate_length(&self, expected: usize) -> Result<()> {
        if self.process.len() != expected {
            return Err(Error::Platform(PlatformError::ProcessInvalidLength {
                expected,
                actual: self.process.len(),
            }));
        }
        Ok(())
    }

    /// Checks if this process is equal to another
    pub fn equals(&self, other: &Self) -> bool {
        self.process == other.process
    }

    /// Checks if the process ID is empty
    pub fn is_empty(&self) -> bool {
        self.process.is_empty()
    }

    /// Returns the length of the process ID
    pub fn len(&self) -> usize {
        self.process.len()
    }
}

impl Serializable for Process {
    fn to_bytes(&self) -> Result<Vec<u8>> {
        let mut buf = Vec::new();
        self.encode(&mut buf)
            .map_err(|e| Error::Platform(PlatformError::SerializationError(e.to_string())))?;
        Ok(buf)
    }

    fn from_bytes(bytes: &[u8]) -> Result<Self> {
        Process::decode(bytes)
            .map_err(|e| Error::Platform(PlatformError::DeserializationError(e.to_string())))
    }
}
