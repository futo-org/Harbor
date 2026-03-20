use std::cmp::Ordering;

use crate::error::{Error, Result};
use crate::models::protos::VectorClock;
use crate::models::traits::Serializable;
use crate::platform::error::PlatformError;
use prost::Message;

impl VectorClock {
    /// Gets the logical clocks array
    pub fn clocks(&self) -> &[u64] {
        &self.logical_clocks
    }

    /// Creates a new vector clock with the given logical clocks
    pub fn new(logical_clocks: Vec<u64>) -> Self {
        Self { logical_clocks }
    }

    /// Creates an empty vector clock
    pub fn empty() -> Self {
        Self {
            logical_clocks: Vec::new(),
        }
    }

    /// Increments the logical clock at the given index
    pub fn increment(&mut self, index: usize) {
        if index >= self.logical_clocks.len() {
            self.logical_clocks.resize(index + 1, 0);
        }
        self.logical_clocks[index] += 1;
    }

    /// Gets the logical clock value at the given index
    pub fn get(&self, index: usize) -> u64 {
        if index >= self.logical_clocks.len() {
            0
        } else {
            self.logical_clocks[index]
        }
    }

    /// Sets the logical clock value at the given index
    pub fn set(&mut self, index: usize, value: u64) {
        if index >= self.logical_clocks.len() {
            self.logical_clocks.resize(index + 1, 0);
        }
        self.logical_clocks[index] = value;
    }

    /// Returns the length of the vector clock
    pub fn len(&self) -> usize {
        self.logical_clocks.len()
    }

    /// Checks if the vector clock is empty
    pub fn is_empty(&self) -> bool {
        self.logical_clocks.is_empty()
    }

    /// Returns the maximum value in the vector clock
    pub fn max_value(&self) -> u64 {
        self.logical_clocks.iter().copied().max().unwrap_or(0)
    }

    /// Returns the sum of all values in the vector clock
    pub fn sum(&self) -> u64 {
        self.logical_clocks.iter().sum()
    }

    /// Merges two vector clocks, taking the maximum value for each index
    pub fn merge(&self, other: &Self) -> Self {
        let max_len = std::cmp::max(self.logical_clocks.len(), other.logical_clocks.len());
        let mut merged = vec![0; max_len];

        for (i, merged_val) in merged.iter_mut().enumerate().take(max_len) {
            *merged_val = std::cmp::max(self.get(i), other.get(i));
        }

        Self {
            logical_clocks: merged,
        }
    }

    /// Checks if this vector clock is greater than or equal to another
    pub fn is_greater_than_or_equal(&self, other: &Self) -> bool {
        let max_len = std::cmp::max(self.logical_clocks.len(), other.logical_clocks.len());

        for i in 0..max_len {
            let self_val = self.get(i);
            let other_val = other.get(i);

            if self_val < other_val {
                return false;
            }
        }

        true
    }

    /// Checks if this vector clock is concurrent with another
    pub fn is_concurrent_with(&self, other: &Self) -> bool {
        !self.is_greater_than_or_equal(other) && !other.is_greater_than_or_equal(self)
    }

    /// Returns true if this vector clock is less than or equal to another
    pub fn is_less_than_or_equal(&self, other: &Self) -> bool {
        let max_len = std::cmp::max(self.logical_clocks.len(), other.logical_clocks.len());

        for i in 0..max_len {
            let self_val = self.get(i);
            let other_val = other.get(i);

            if self_val > other_val {
                return false;
            }
        }

        true
    }

    /// Returns true if this vector clock is equal to another
    pub fn is_equal(&self, other: &Self) -> bool {
        let max_len = std::cmp::max(self.logical_clocks.len(), other.logical_clocks.len());

        for i in 0..max_len {
            if self.get(i) != other.get(i) {
                return false;
            }
        }

        true
    }

    /// Compare two vector clocks
    pub fn compare_to(&self, other: &VectorClock) -> Ordering {
        let mut self_greater = false;
        let mut other_greater = false;

        // VectorClock has logical_clocks as Vec<u64>
        let max_len = self.logical_clocks.len().max(other.logical_clocks.len());

        for i in 0..max_len {
            let self_clock = self.logical_clocks.get(i).unwrap_or(&0);
            let other_clock = other.logical_clocks.get(i).unwrap_or(&0);

            match self_clock.cmp(other_clock) {
                Ordering::Greater => self_greater = true,
                Ordering::Less => other_greater = true,
                Ordering::Equal => {} // Continue checking
            }
        }

        match (self_greater, other_greater) {
            (true, false) => Ordering::Greater,
            (false, true) => Ordering::Less,
            (false, false) => Ordering::Equal,
            (true, true) => Ordering::Equal, // Concurrent/incomparable
        }
    }

    /// Merge arbitrarily many vector clocks into one
    pub fn merge_vector_clocks(clocks: &[VectorClock]) -> VectorClock {
        let mut max_len = 0;
        for clock in clocks {
            max_len = max_len.max(clock.logical_clocks.len());
        }

        let mut merged_clocks = vec![0u64; max_len];

        for clock in clocks {
            for (i, &logical_clock) in clock.logical_clocks.iter().enumerate() {
                merged_clocks[i] = merged_clocks[i].max(logical_clock);
            }
        }

        VectorClock {
            logical_clocks: merged_clocks,
        }
    }
}

impl Serializable for VectorClock {
    fn to_bytes(&self) -> Result<Vec<u8>> {
        let mut buf = Vec::new();
        self.encode(&mut buf)
            .map_err(|e| Error::Platform(PlatformError::SerializationError(e.to_string())))?;
        Ok(buf)
    }

    fn from_bytes(bytes: &[u8]) -> Result<Self> {
        VectorClock::decode(bytes)
            .map_err(|e| Error::Platform(PlatformError::DeserializationError(e.to_string())))
    }
}
