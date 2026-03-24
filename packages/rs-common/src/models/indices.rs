use crate::error::{Error, Result};
use crate::models::protos::{Index, Indices};
use crate::models::traits::Serializable;
use crate::platform::error::PlatformError;
use prost::Message;

impl Index {
    /// Creates a new index with the given type and logical clock
    pub fn new(index_type: u64, logical_clock: u64) -> Self {
        Self {
            index_type,
            logical_clock,
        }
    }

    /// Gets the index type
    pub fn index_type(&self) -> u64 {
        self.index_type
    }

    /// Gets the logical clock value
    pub fn logical_clock(&self) -> u64 {
        self.logical_clock
    }

    /// Sets the logical clock value
    pub fn set_logical_clock(&mut self, logical_clock: u64) {
        self.logical_clock = logical_clock;
    }

    /// Increments the logical clock by 1
    pub fn increment_logical_clock(&mut self) {
        self.logical_clock += 1;
    }
}

impl Indices {
    /// Creates a new empty indices collection
    pub fn new() -> Self {
        Self {
            indices: Vec::new(),
        }
    }

    /// Creates a new indices collection with a single index
    pub fn with_index(index_type: u64, logical_clock: u64) -> Self {
        let mut indices = Self::new();
        indices.add_index(index_type, logical_clock);
        indices
    }

    /// Adds a new index with the given type and logical clock
    pub fn add_index(&mut self, index_type: u64, logical_clock: u64) {
        self.indices.push(Index {
            index_type,
            logical_clock,
        });
    }

    /// Gets all indices
    pub fn all_indices(&self) -> &[Index] {
        &self.indices
    }

    /// Gets the logical clock value for a given index type, if it exists
    pub fn get_logical_clock(&self, index_type: u64) -> Option<u64> {
        self.indices
            .iter()
            .find(|index| index.index_type == index_type)
            .map(|index| index.logical_clock)
    }

    /// Checks if an index of the given type exists
    pub fn has_index(&self, index_type: u64) -> bool {
        self.indices
            .iter()
            .any(|index| index.index_type == index_type)
    }

    /// Removes an index of the given type, if it exists
    pub fn remove_index(&mut self, index_type: u64) {
        self.indices.retain(|index| index.index_type != index_type);
    }

    /// Returns the number of indices
    pub fn len(&self) -> usize {
        self.indices.len()
    }

    /// Checks if there are no indices
    pub fn is_empty(&self) -> bool {
        self.indices.is_empty()
    }

    /// Gets all index types in the collection
    pub fn index_types(&self) -> Vec<u64> {
        self.indices.iter().map(|index| index.index_type).collect()
    }

    /// Updates the logical clock for an existing index type
    /// Returns true if the index was updated, false if it didn't exist
    pub fn update_logical_clock(&mut self, index_type: u64, logical_clock: u64) -> bool {
        if let Some(index) = self.indices.iter_mut().find(|i| i.index_type == index_type) {
            index.logical_clock = logical_clock;
            true
        } else {
            false
        }
    }

    /// Gets the maximum logical clock value across all indices
    pub fn max_logical_clock(&self) -> Option<u64> {
        self.indices.iter().map(|index| index.logical_clock).max()
    }

    /// Removes all indices from the collection
    pub fn clear(&mut self) {
        self.indices.clear();
    }

    /// Checks if this indices collection is equal to another
    pub fn equals(&self, other: &Self) -> bool {
        if self.len() != other.len() {
            return false;
        }

        for index in &self.indices {
            if let Some(other_clock) = other.get_logical_clock(index.index_type) {
                if other_clock != index.logical_clock {
                    return false;
                }
            } else {
                return false;
            }
        }

        true
    }

    /// Merges two indices collections, taking the maximum logical clock value for each index type
    pub fn merge(&self, other: &Self) -> Self {
        let mut merged = Self::new();
        let mut seen_types = std::collections::HashSet::new();

        // Add all indices from self
        for index in &self.indices {
            merged.add_index(index.index_type, index.logical_clock);
            seen_types.insert(index.index_type);
        }

        // Add or update indices from other
        for index in &other.indices {
            if let Some(existing) = merged
                .indices
                .iter_mut()
                .find(|i| i.index_type == index.index_type)
            {
                existing.logical_clock = std::cmp::max(existing.logical_clock, index.logical_clock);
            } else {
                merged.add_index(index.index_type, index.logical_clock);
            }
            seen_types.insert(index.index_type);
        }

        merged
    }
}

impl Serializable for Indices {
    fn to_bytes(&self) -> Result<Vec<u8>> {
        let mut buf = Vec::new();
        self.encode(&mut buf)
            .map_err(|e| Error::Platform(PlatformError::SerializationError(e.to_string())))?;
        Ok(buf)
    }

    fn from_bytes(bytes: &[u8]) -> Result<Self> {
        Indices::decode(bytes)
            .map_err(|e| Error::Platform(PlatformError::DeserializationError(e.to_string())))
    }
}
