use std::fmt;

use prost::{DecodeError, Message};

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
                max_len: Some(10 * 1024 * 1024), // 10 MB.
                ..Default::default()
            },
        );
        if too_large {
            // If the schema is too large don't bother validating it further.
            return;
        }
        if let Some(digest) = digest.as_ref() {
            digest.validate_check(errors, |err| map_err(ValidationError::Digest(err)));
            if let Err(err) = digest.verify_against(schema_bytes) {
                errors.push(map_err(ValidationError::DigestInvalid(err)));
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
            Err(err) => {
                errors.push(map_err(ValidationError::SchemaBytesInvalid(err)));
            }
        }
    }
}

#[derive(Debug)]
pub enum ValidationError {
    SchemaBytes(SliceError),
    SchemaBytesInvalid(DecodeError),
    Schema(verification_schema::ValidationError),
    Digest(content_digest::ValidationError),
    DigestMissing,
    DigestInvalid(DigestError),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::SchemaBytes(err) => write!(f, "schema bytes {err}"),
            ValidationError::SchemaBytesInvalid(err) => write!(f, "schema bytes invalid: {err}"),
            ValidationError::Schema(err) => write!(f, "schema {err}"),
            ValidationError::Digest(err) => write!(f, "digest {err}"),
            ValidationError::DigestMissing => write!(f, "digest is missing"),
            ValidationError::DigestInvalid(err) => write!(f, "digest invalid: {err}"),
        }
    }
}
