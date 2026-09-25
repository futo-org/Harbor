use std::fmt;

use crate::models::content_digest;
use crate::models::protos_v2::Blob;
use crate::models::validate::{self, IntConfig, IntError, StringConfig, StringError, Validate};

impl Validate for Blob {
    type Error = ValidationError;

    fn validate(&self) -> Result<(), Self::Error> {
        let Blob {
            digest,
            mime_type,
            size,
        } = self;
        if let Some(digest) = digest {
            digest.validate().map_err(ValidationError::Digest)?;
        } else {
            return Err(ValidationError::DigestMissing);
        }
        validate::string(
            mime_type,
            StringConfig {
                min_len: Some(1),
                max_len: Some(50),
                ..Default::default()
            },
        )
        .map_err(ValidationError::MimeType)?;
        validate::int(
            *size,
            IntConfig {
                min: Some(1),
                max: Some(100 * 1024 * 1024), // 100 MB.
                ..Default::default()
            },
        )
        .map_err(ValidationError::Size)?;
        Ok(())
    }
}

#[derive(Debug)]
pub enum ValidationError {
    Digest(content_digest::ValidationError),
    DigestMissing,
    MimeType(StringError),
    Size(IntError<i64>),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Digest(err) => write!(f, "digest {err}"),
            ValidationError::DigestMissing => write!(f, "digest is missing"),
            ValidationError::MimeType(err) => write!(f, "mime type {err}"),
            ValidationError::Size(err) => write!(f, "size {err}"),
        }
    }
}
