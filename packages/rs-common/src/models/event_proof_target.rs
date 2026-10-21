use std::fmt;

use crate::models::protos_v2::EventProofTarget;
use crate::models::validate::{self, SliceConfig, SliceError, Validate};

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
        validate::slice(
            signature,
            errors,
            |err| map_err(ValidationError::Signature(err)),
            SliceConfig {
                min_len: Some(64),
                max_len: Some(64),
                ..Default::default()
            },
        );
        validate::slice(
            root,
            errors,
            |err| map_err(ValidationError::Root(err)),
            SliceConfig {
                min_len: Some(32),
                max_len: Some(32),
                ..Default::default()
            },
        );
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
