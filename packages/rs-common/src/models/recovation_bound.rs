use std::fmt;

use crate::models::protos_v2::RevocationBound;
use crate::models::validate::{self, SliceConfig, SliceError, Validate};
use crate::models::{event_proof_target, public_key};

impl Validate for RevocationBound {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let RevocationBound {
            revoked_key,
            targets,
        } = self;
        if let Some(revoked_key) = revoked_key {
            revoked_key.validate_check(errors, |err| map_err(ValidationError::RevokedKey(err)));
        } else {
            errors.push(map_err(ValidationError::RevokedKeyMissing));
        }
        validate::slice2(
            targets,
            errors,
            |err| map_err(ValidationError::Targets(err)),
            |index, error| map_err(ValidationError::TargetsItem { index, error }),
            SliceConfig {
                max_len: Some(200),
                ..Default::default()
            },
            |target, errors, map_err| target.validate_check(errors, map_err),
        );
    }
}

#[derive(Debug)]
pub enum ValidationError {
    RevokedKey(public_key::ValidationError),
    RevokedKeyMissing,
    Targets(SliceError),
    TargetsItem {
        index: u32,
        error: event_proof_target::ValidationError,
    },
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::RevokedKey(err) => write!(f, "revoked key {err}"),
            ValidationError::RevokedKeyMissing => write!(f, "revoked key is missing"),
            ValidationError::Targets(err) => write!(f, "targets {err}"),
            ValidationError::TargetsItem { index, error } => {
                write!(f, "targets {index}-th {error}")
            }
        }
    }
}
