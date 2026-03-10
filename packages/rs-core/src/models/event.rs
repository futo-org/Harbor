use crate::error::{Error, Result};
use crate::models::protos::{
    ContentType, Event, Indices, LwwElement, LwwElementSet, Process, PublicKey, Reference,
    VectorClock,
};
use crate::models::traits::Serializable;
use crate::platform::error::PlatformError;
use prost::Message;

impl Event {
    /// Creates a new event with the given parameters
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        system: PublicKey,
        process: Process,
        logical_clock: u64,
        content_type: ContentType,
        content: Vec<u8>,
        vector_clock: VectorClock,
        indices: Indices,
        lww_element_set: Option<LwwElementSet>,
        lww_element: Option<LwwElement>,
        references: Vec<Reference>,
        unix_milliseconds: Option<u64>,
    ) -> Self {
        Self {
            system: Some(system),
            process: Some(process),
            logical_clock,
            content_type: content_type as i32,
            content,
            vector_clock: Some(vector_clock),
            indices: Some(indices),
            lww_element_set,
            lww_element,
            references,
            unix_milliseconds,
        }
    }

    /// Gets the system public key
    pub fn system(&self) -> Result<&PublicKey> {
        self.system.as_ref().ok_or_else(|| {
            Error::Platform(PlatformError::DeserializationError(
                "Event missing system".to_string(),
            ))
        })
    }

    /// Gets the process
    pub fn process(&self) -> Result<&Process> {
        self.process.as_ref().ok_or_else(|| {
            Error::Platform(PlatformError::DeserializationError(
                "Event missing process".to_string(),
            ))
        })
    }

    /// Gets the logical clock value
    pub fn logical_clock(&self) -> u64 {
        self.logical_clock
    }

    /// Gets the content type as a ContentType enum
    pub fn get_content_type(&self) -> Option<ContentType> {
        ContentType::try_from(self.content_type).ok()
    }

    /// Gets the content data
    pub fn content(&self) -> &[u8] {
        &self.content
    }

    /// Gets the vector clock
    pub fn vector_clock(&self) -> Result<&VectorClock> {
        self.vector_clock.as_ref().ok_or_else(|| {
            Error::Platform(PlatformError::DeserializationError(
                "Event missing vector clock".to_string(),
            ))
        })
    }

    /// Gets the indices, if present
    pub fn indices(&self) -> Option<&Indices> {
        self.indices.as_ref()
    }

    /// Gets the LWW element set, if present
    pub fn lww_element_set(&self) -> Option<&LwwElementSet> {
        self.lww_element_set.as_ref()
    }

    /// Gets the LWW element, if present
    pub fn lww_element(&self) -> Option<&LwwElement> {
        self.lww_element.as_ref()
    }

    /// Gets all references
    pub fn references(&self) -> &[Reference] {
        &self.references
    }

    /// Gets the Unix timestamp in milliseconds
    pub fn get_unix_milliseconds(&self) -> Option<u64> {
        self.unix_milliseconds
    }

    /// Looks up an index by content type
    pub fn lookup_index_by_type(&self, content_type: ContentType) -> Option<u64> {
        self.lookup_index(content_type as i32 as u64)
    }

    /// Looks up an index by content type u64
    pub fn lookup_index(&self, content_type: u64) -> Option<u64> {
        if let Some(indices) = &self.indices {
            for index in &indices.indices {
                if index.index_type == content_type {
                    return Some(index.logical_clock);
                }
            }
        }
        None
    }

    /// Checks if the content type matches the given type
    pub fn content_equals_type(&self, other_type: ContentType) -> bool {
        self.content_type == other_type as i32
    }

    /// Checks if the content type matches the given i32
    pub fn content_equals(&self, other_type: i32) -> bool {
        self.content_type == other_type
    }

    /// Checks if the content type does not match the given type
    pub fn content_not_equals_type(&self, other_type: ContentType) -> bool {
        !self.content_equals_type(other_type)
    }

    /// Checks if the content type does not match the given i32
    pub fn content_not_equals(&self, other_type: i32) -> bool {
        !self.content_equals(other_type)
    }

    /// Checks if this event has indices
    pub fn has_indices(&self) -> bool {
        self.indices.is_some()
    }

    /// Checks if this event has a LWW element set
    pub fn has_lww_element_set(&self) -> bool {
        self.lww_element_set.is_some()
    }

    /// Checks if this event has a LWW element
    pub fn has_lww_element(&self) -> bool {
        self.lww_element.is_some()
    }

    /// Checks if this event has any references
    pub fn has_references(&self) -> bool {
        !self.references.is_empty()
    }

    /// Gets the number of references
    pub fn reference_count(&self) -> usize {
        self.references.len()
    }

    /// Checks if this event has a specific reference type
    pub fn has_reference_type(&self, reference_type: u64) -> bool {
        self.references
            .iter()
            .any(|r| r.reference_type() == reference_type)
    }

    /// Gets all references of a specific type
    pub fn references_of_type(&self, reference_type: u64) -> Vec<&Reference> {
        self.references
            .iter()
            .filter(|r| r.reference_type() == reference_type)
            .collect()
    }

    /// Adds a reference to the event
    pub fn add_reference(&mut self, reference: Reference) {
        self.references.push(reference);
    }

    /// Removes all references of a specific type
    pub fn remove_references_of_type(&mut self, reference_type: u64) {
        self.references
            .retain(|r| r.reference_type() != reference_type);
    }

    /// Checks if this event is newer than another event based on logical clock
    pub fn is_newer_than(&self, other: &Self) -> bool {
        self.logical_clock > other.logical_clock
    }

    /// Checks if this event is older than another event based on logical clock
    pub fn is_older_than(&self, other: &Self) -> bool {
        self.logical_clock < other.logical_clock
    }

    /// Checks if this event has the same logical clock as another event
    pub fn has_same_logical_clock(&self, other: &Self) -> bool {
        self.logical_clock == other.logical_clock
    }

    /// Gets the content as a string if it's valid UTF-8
    pub fn content_as_str(&self) -> Result<&str> {
        std::str::from_utf8(&self.content).map_err(|e| {
            Error::Platform(PlatformError::DeserializationError(format!(
                "Content is not valid UTF-8: {}",
                e
            )))
        })
    }

    /// Validates that the event has all required fields
    pub fn validate(&self) -> Result<()> {
        if self.system.is_none() {
            return Err(Error::Platform(PlatformError::DeserializationError(
                "Event missing system".to_string(),
            )));
        }
        if self.process.is_none() {
            return Err(Error::Platform(PlatformError::DeserializationError(
                "Event missing process".to_string(),
            )));
        }
        if self.vector_clock.is_none() {
            return Err(Error::Platform(PlatformError::DeserializationError(
                "Event missing vector clock".to_string(),
            )));
        }
        if self.unix_milliseconds.is_none() {
            return Err(Error::Platform(PlatformError::DeserializationError(
                "Event missing unix_milliseconds".to_string(),
            )));
        }
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
