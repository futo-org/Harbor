use std::fmt;

use prost::Message;

use crate::error::Error;
use crate::models::protos_v2::{ContentDigest, Event, EventKey, VectorClock};
use crate::models::validate::Validate;
use crate::models::{Serializable, application, content_digest, event_key};
use crate::platform::error::PlatformError;

impl Event {
    /// Creates a new event with the given parameters.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        key: EventKey,
        identity_sequence: u64,
        vector_clock: Option<VectorClock>,
        previous_signature: Vec<u8>,
        previous_root: Vec<u8>,
        content_digest: Option<ContentDigest>,
        created_at: u64,
    ) -> Self {
        Self {
            key: Some(key),
            identity_sequence,
            vector_clock,
            previous_signature,
            previous_root,
            content_digest,
            created_at,
            application: None,
        }
    }

    /// Validates that the event has all required fields
    pub fn validate(&self) -> Result<(), Error> {
        // if self.system.is_none() {
        //     return Err(Error::Platform(PlatformError::DeserializationError(
        //         "Event missing system".to_string(),
        //     )));
        // }
        // if self.process.is_none() {
        //     return Err(Error::Platform(PlatformError::DeserializationError(
        //         "Event missing process".to_string(),
        //     )));
        // }
        // if self.vector_clock.is_none() {
        //     return Err(Error::Platform(PlatformError::DeserializationError(
        //         "Event missing vector clock".to_string(),
        //     )));
        // }
        // if self.unix_milliseconds.is_none() {
        //     return Err(Error::Platform(PlatformError::DeserializationError(
        //         "Event missing unix_milliseconds".to_string(),
        //     )));
        // }
        Ok(())
    }
}

impl Serializable for Event {
    fn to_bytes(&self) -> Result<Vec<u8>, Error> {
        let mut buf = Vec::new();
        self.encode(&mut buf)
            .map_err(|e| Error::Platform(PlatformError::SerializationError(e.to_string())))?;
        Ok(buf)
    }

    fn from_bytes(bytes: &[u8]) -> Result<Self, Error> {
        Event::decode(bytes)
            .map_err(|e| Error::Platform(PlatformError::DeserializationError(e.to_string())))
    }
}

impl Validate for Event {
    type Error = ValidationError;

    fn validate(&self) -> Result<(), Self::Error> {
        let Event {
            key,
            identity_sequence: _,  // No validation.
            vector_clock: _,       // TODO.
            previous_signature: _, // Can't validate.
            content_digest,
            created_at: _,    // No validation.
            previous_root: _, // Can't validate.
            application,
        } = self;
        if let Some(key) = key.as_ref() {
            // NOTE: currently has a validate method that is used over the
            // Validate trait implementation. Once that is removed this can be
            // change to `key.validate()?`.
            Validate::validate(key)?;
        } else {
            return Err(ValidationError::KeyMissing);
        }
        if let Some(content_digest) = content_digest.as_ref() {
            content_digest.validate()?;
        } else {
            return Err(ValidationError::ContentDigestMissing);
        }
        if let Some(application) = application.as_ref() {
            application.validate()?;
        }
        Ok(())
    }
}

#[derive(Debug)]
pub enum ValidationError {
    Key(event_key::ValidationError),
    KeyMissing,
    ContentDigest(content_digest::ValidationError),
    ContentDigestMissing,
    Application(application::ValidationError),
}

impl From<event_key::ValidationError> for ValidationError {
    fn from(err: event_key::ValidationError) -> ValidationError {
        ValidationError::Key(err)
    }
}

impl From<content_digest::ValidationError> for ValidationError {
    fn from(err: content_digest::ValidationError) -> ValidationError {
        ValidationError::ContentDigest(err)
    }
}

impl From<application::ValidationError> for ValidationError {
    fn from(err: application::ValidationError) -> ValidationError {
        ValidationError::Application(err)
    }
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Key(err) => write!(f, "key {err}"),
            ValidationError::KeyMissing => write!(f, "key is missing"),
            ValidationError::ContentDigest(err) => write!(f, "content digest {err}"),
            ValidationError::ContentDigestMissing => write!(f, "content digest is missing"),
            ValidationError::Application(err) => write!(f, "application {err}"),
        }
    }
}
