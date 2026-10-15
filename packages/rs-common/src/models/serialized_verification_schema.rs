use std::fmt;

use prost::Message;

use crate::models::content_digest::{self, DigestError};
use crate::models::protos_v2::{SerializedVerificationSchema, VerificationSchema};
use crate::models::validate::{self, SliceConfig, SliceError, Validate};
use crate::models::verification_schema;

impl Validate for SerializedVerificationSchema {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let SerializedVerificationSchema {
            schema_bytes,
            digest,
        } = self;
        let too_large = validate::slice(
            schema_bytes,
            errors,
            |err| map_err(ValidationError::SchemaBytes(err)),
            SliceConfig {
                max_len: Some(1024 * 1024), // 1 MB.
                ..Default::default()
            },
        );
        if too_large {
            // If the schema is too large don't bother validating it further.
            return;
        }
        if let Some(digest) = digest.as_ref() {
            let errors_start = errors.len();
            digest.validate_check(errors, |err| map_err(ValidationError::Digest(err)));
            if errors_start != errors.len() {
                return; // Don't both verifying the content as the digest is invalid.
            }
            if let Err(err) = digest.verify_against(schema_bytes) {
                // NOTE: we already checked if the digest type is valid, so only
                // error left is mismatch
                debug_assert!(matches!(err, DigestError::Mismatch));
                errors.push(map_err(ValidationError::DigestMismatch));
                return; // Don't decode the schema if it's not valid.
            }
        } else {
            errors.push(map_err(ValidationError::DigestMissing));
            return; // Don't decode the schema without a digest.
        }

        match VerificationSchema::decode(schema_bytes.as_slice()) {
            Ok(schema) => {
                schema.validate_check(errors, |err| map_err(ValidationError::Schema(err)));
            }
            Err(_) => {
                // NOTE: can't share the error as it doesn't work with uniffi.
                errors.push(map_err(ValidationError::SchemaBytesInvalid));
            }
        }
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "uniffi", derive(uniffi::Enum))]
#[cfg_attr(
    feature = "uniffi",
    uniffi(name = "SerializedVerificationSchemaValidationError")
)]
pub enum ValidationError {
    SchemaBytes(SliceError),
    SchemaBytesInvalid,
    Schema(verification_schema::ValidationError),
    Digest(content_digest::ValidationError),
    DigestMissing,
    DigestMismatch,
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::SchemaBytes(err) => write!(f, "schema bytes {err}"),
            ValidationError::SchemaBytesInvalid => write!(f, "schema bytes are invalid"),
            ValidationError::Schema(err) => write!(f, "schema {err}"),
            ValidationError::Digest(err) => write!(f, "digest {err}"),
            ValidationError::DigestMissing => write!(f, "digest is missing"),
            ValidationError::DigestMismatch => write!(f, "digest does not match"),
        }
    }
}
