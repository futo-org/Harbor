use crate::error::{Error, Result};
use crate::models::protos::LwwElementSet;
use crate::models::traits::Serializable;
use crate::platform::error::PlatformError;
use prost::Message;
use std::collections::HashMap;

impl LwwElementSet {
    /// Creates a new LWW element set with the given operation, value, and timestamp
    pub fn new(operation: i32, value: Vec<u8>, unix_milliseconds: u64) -> Self {
        Self {
            operation,
            value,
            unix_milliseconds,
        }
    }

    /// Creates a new LWW element set for adding a value
    pub fn new_add(value: Vec<u8>, unix_milliseconds: u64) -> Self {
        Self::new(0, value, unix_milliseconds)
    }

    /// Creates a new LWW element set for removing a value
    pub fn new_remove(value: Vec<u8>, unix_milliseconds: u64) -> Self {
        Self::new(1, value, unix_milliseconds)
    }

    /// Gets the operation type (0 for add, 1 for remove)
    pub fn get_operation(&self) -> i32 {
        self.operation
    }

    /// Gets the value data
    pub fn value(&self) -> &[u8] {
        &self.value
    }

    /// Gets the Unix timestamp in milliseconds
    pub fn unix_milliseconds(&self) -> u64 {
        self.unix_milliseconds
    }

    /// Gets operation as a string
    pub fn operation_as_str(&self) -> String {
        match self.get_operation() {
            0 => "add".to_string(),
            1 => "remove".to_string(),
            _ => "unknown".to_string(),
        }
    }

    /// Checks if this is an add operation
    pub fn is_add_operation(&self) -> bool {
        self.get_operation() == 0
    }

    /// Checks if this is a remove operation
    pub fn is_remove_operation(&self) -> bool {
        self.get_operation() == 1
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

    /// Merges multiple LWW element sets, taking the latest operation for each value
    pub fn merge_sets(sets: &[Self]) -> HashMap<Vec<u8>, Self> {
        let mut merged: HashMap<Vec<u8>, Self> = HashMap::new();

        for set in sets {
            let value = set.value.clone();
            let existing = merged.get(&value);

            match existing {
                Some(existing_set) if existing_set.unix_milliseconds >= set.unix_milliseconds => {}
                _ => {
                    merged.insert(value, set.clone());
                }
            }
        }

        merged
    }

    /// Checks if this LWW element set is newer than another based on timestamp
    pub fn is_newer_than(&self, other: &Self) -> bool {
        self.unix_milliseconds > other.unix_milliseconds
    }
}

impl Serializable for LwwElementSet {
    fn to_bytes(&self) -> Result<Vec<u8>> {
        let mut buf = Vec::new();
        self.encode(&mut buf)
            .map_err(|e| Error::Platform(PlatformError::SerializationError(e.to_string())))?;
        Ok(buf)
    }

    fn from_bytes(bytes: &[u8]) -> Result<Self> {
        LwwElementSet::decode(bytes)
            .map_err(|e| Error::Platform(PlatformError::DeserializationError(e.to_string())))
    }
}
