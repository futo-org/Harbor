use std::fmt;

use prost::Message;

use crate::error::Error;
use crate::models::collections::{
    FEED, IDENTITY, INTERACTIONS, LABELS, PROFILE, REPORTS, SOCIAL_GRAPH, VERIFICATIONS,
};
use crate::models::protos_v2::{EventKey, PublicKey};
use crate::models::validate::{self, StringConfig, Validate};
use crate::models::{Serializable, public_key};
use crate::platform::error::PlatformError;

impl EventKey {
    pub fn new(collection: i32, identity: String, signed_by: PublicKey, sequence: u64) -> Self {
        Self {
            collection,
            identity,
            signed_by: Some(signed_by),
            sequence,
        }
    }

    pub fn validate(&self) -> Result<(), Error> {
        if self.identity.is_empty() {
            return Err(Error::Platform(PlatformError::SerializationError(
                "EventKey.identity is empty".to_string(),
            )));
        }
        if self.signed_by.is_none() {
            return Err(Error::Platform(PlatformError::SerializationError(
                "EventKey.signed_by is missing".to_string(),
            )));
        }
        Ok(())
    }
}

impl Serializable for EventKey {
    fn to_bytes(&self) -> Result<Vec<u8>, Error> {
        let mut buf = Vec::new();
        self.encode(&mut buf)
            .map_err(|e| Error::Platform(PlatformError::SerializationError(e.to_string())))?;
        Ok(buf)
    }

    fn from_bytes(bytes: &[u8]) -> Result<Self, Error> {
        EventKey::decode(bytes)
            .map_err(|e| Error::Platform(PlatformError::DeserializationError(e.to_string())))
    }
}

impl fmt::Debug for EventKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let EventKey {
            collection,
            identity,
            signed_by,
            sequence,
        } = self;
        f.debug_struct("EventKey")
            .field(
                "collection",
                match *collection {
                    IDENTITY => &"identity",
                    FEED => &"feed",
                    PROFILE => &"profile",
                    INTERACTIONS => &"interactions",
                    SOCIAL_GRAPH => &"social_graph",
                    REPORTS => &"reports",
                    LABELS => &"labels",
                    VERIFICATIONS => &"verifications",
                    _ => collection,
                },
            )
            .field("identity", identity)
            .field("signed_by", signed_by)
            .field("sequence", sequence)
            .finish()
    }
}

impl Validate for EventKey {
    type Error = ValidationError;

    fn validate(&self) -> Result<(), Self::Error> {
        let EventKey {
            collection: _, // No validation.
            identity,
            signed_by,
            sequence: _, // No validation.
        } = self;
        #[rustfmt::skip]
        validate::string(identity, StringConfig { min_len: Some(1), ..Default::default() }) .map_err(ValidationError::Identity)?;
        if let Some(signed_by) = signed_by.as_ref() {
            signed_by.validate()?;
        } else {
            return Err(ValidationError::SignedByMissing);
        }
        Ok(())
    }
}

#[derive(Debug)]
pub enum ValidationError {
    Identity(validate::StringError),
    SignedBy(public_key::ValidationError),
    SignedByMissing,
}

impl From<public_key::ValidationError> for ValidationError {
    fn from(err: public_key::ValidationError) -> ValidationError {
        ValidationError::SignedBy(err)
    }
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Identity(err) => write!(f, "identity {err}"),
            ValidationError::SignedBy(err) => write!(f, "signed by {err}"),
            ValidationError::SignedByMissing => write!(f, "signed by is missing"),
        }
    }
}
