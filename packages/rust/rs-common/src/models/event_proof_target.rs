use std::fmt;

use crate::models::protos_v2::EventProofTarget;
use crate::models::validate::{self, SliceError, Validate};

impl Validate for EventProofTarget {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let EventProofTarget {
            collection: _,
            signature,
            root,
            leaf_count: _,
        } = self;
        validate::ed25519_signature(signature, errors, |err| {
            map_err(ValidationError::Signature(err))
        });
        validate::sha256_hash(root, errors, |err| map_err(ValidationError::Root(err)));
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "uniffi", derive(uniffi::Enum))]
#[cfg_attr(feature = "uniffi", uniffi(name = "EventProofTargetValidationError"))]
pub enum ValidationError {
    Signature(SliceError),
    Root(SliceError),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Signature(err) => write!(f, "signature {err}"),
            ValidationError::Root(err) => write!(f, "root {err}"),
        }
    }
}
