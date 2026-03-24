use crate::error::{Error, Result};
use crate::models::protos::Pointer;
use crate::models::traits::Serializable;
use crate::platform::error::PlatformError;
use prost::Message;

impl Pointer {
    /// Creates a new pointer with the given system, process, logical clock, and event digest
    pub fn new(
        system: Option<crate::models::protos::PublicKey>,
        process: Option<crate::models::protos::Process>,
        logical_clock: u64,
        event_digest: Option<crate::models::protos::Digest>,
    ) -> Self {
        Self {
            system,
            process,
            logical_clock,
            event_digest,
        }
    }

    /// Gets the system key
    pub fn system(&self) -> Option<&crate::models::protos::PublicKey> {
        self.system.as_ref()
    }

    /// Gets the process
    pub fn process(&self) -> Option<&crate::models::protos::Process> {
        self.process.as_ref()
    }

    /// Gets the logical clock
    pub fn logical_clock(&self) -> u64 {
        self.logical_clock
    }

    /// Gets the event digest
    pub fn event_digest(&self) -> Option<&crate::models::protos::Digest> {
        self.event_digest.as_ref()
    }

    /// Sets the system key
    pub fn set_system(&mut self, system: Option<crate::models::protos::PublicKey>) {
        self.system = system;
    }

    /// Sets the process
    pub fn set_process(&mut self, process: Option<crate::models::protos::Process>) {
        self.process = process;
    }

    /// Sets the logical clock
    pub fn set_logical_clock(&mut self, logical_clock: u64) {
        self.logical_clock = logical_clock;
    }

    /// Sets the event digest
    pub fn set_event_digest(&mut self, event_digest: Option<crate::models::protos::Digest>) {
        self.event_digest = event_digest;
    }

    /// Validates that the pointer has required fields
    pub fn validate(&self) -> Result<()> {
        if self.system.is_none() {
            return Err(Error::Platform(PlatformError::DeserializationError(
                "Pointer missing system".to_string(),
            )));
        }
        if self.process.is_none() {
            return Err(Error::Platform(PlatformError::DeserializationError(
                "Pointer missing process".to_string(),
            )));
        }
        Ok(())
    }
}

impl Serializable for Pointer {
    fn to_bytes(&self) -> Result<Vec<u8>> {
        Ok(self.encode_to_vec())
    }

    fn from_bytes(bytes: &[u8]) -> Result<Self> {
        Pointer::decode(bytes)
            .map_err(|e| Error::Platform(PlatformError::DeserializationError(e.to_string())))
    }
}
