use crate::error::{Error, Result};
use crate::models::protos::ModerationTag;
use crate::models::traits::Serializable;
use crate::platform::error::PlatformError;
use prost::Message;

impl ModerationTag {
    /// Creates a new moderation tag with the given name and level
    pub fn new(name: String, level: u32) -> Self {
        Self { name, level }
    }

    /// Creates a new moderation tag with level 0
    pub fn new_with_default_level(name: String) -> Self {
        Self::new(name, 0)
    }

    /// Gets the tag name
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Gets the tag level
    pub fn level(&self) -> u32 {
        self.level
    }

    /// Sets the tag level
    pub fn set_level(&mut self, level: u32) {
        self.level = level;
    }

    /// Increments the tag level by 1
    pub fn increment_level(&mut self) {
        self.level = self.level.saturating_add(1);
    }

    /// Decrements the tag level by 1, but not below 0
    pub fn decrement_level(&mut self) {
        self.level = self.level.saturating_sub(1);
    }

    /// Checks if this tag has the same name as another tag
    pub fn has_same_name(&self, other: &Self) -> bool {
        self.name == other.name
    }

    /// Checks if this tag has a higher level than another tag
    pub fn has_higher_level(&self, other: &Self) -> bool {
        self.level > other.level
    }

    /// Checks if this tag has a lower level than another tag
    pub fn has_lower_level(&self, other: &Self) -> bool {
        self.level < other.level
    }

    /// Checks if this tag has the same level as another tag
    pub fn has_same_level(&self, other: &Self) -> bool {
        self.level == other.level
    }

    /// Merges two moderation tags, taking the one with the higher level
    pub fn merge(&self, other: &Self) -> Self {
        if self.level >= other.level {
            self.clone()
        } else {
            other.clone()
        }
    }

    /// Returns true if the tag has a level of 0
    pub fn is_default_level(&self) -> bool {
        self.level == 0
    }
}

impl Serializable for ModerationTag {
    fn to_bytes(&self) -> Result<Vec<u8>> {
        let mut buf = Vec::new();
        self.encode(&mut buf)
            .map_err(|e| Error::Platform(PlatformError::SerializationError(e.to_string())))?;
        Ok(buf)
    }

    fn from_bytes(bytes: &[u8]) -> Result<Self> {
        ModerationTag::decode(bytes)
            .map_err(|e| Error::Platform(PlatformError::DeserializationError(e.to_string())))
    }
}
