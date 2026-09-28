use std::fmt;

use crate::models::content_digest;
use crate::models::protos_v2::Blob;
use crate::models::validate::{self, IntConfig, IntError, StringConfig, StringError, Validate};

impl Validate for Blob {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let Blob {
            digest,
            mime_type,
            size,
        } = self;
        if let Some(digest) = digest {
            digest.validate_check(errors, |err| map_err(ValidationError::Digest(err)));
        } else {
            errors.push(map_err(ValidationError::DigestMissing));
        }
        validate::string(
            mime_type,
            errors,
            |err| map_err(ValidationError::MimeType(err)),
            StringConfig {
                min_len: Some(1),
                max_len: Some(50),
                ..Default::default()
            },
        );
        validate::int(
            *size,
            errors,
            |err| map_err(ValidationError::Size(err)),
            IntConfig {
                min: Some(1),
                max: Some(100 * 1024 * 1024), // 100 MB.
                ..Default::default()
            },
        )
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
