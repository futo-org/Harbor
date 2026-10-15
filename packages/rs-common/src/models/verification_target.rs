use std::fmt;

use crate::models::protos_v2::VerificationTarget;
use crate::models::validate::{self, SliceConfig, SliceError, StringError, Validate};
use crate::models::{collections, event_key};

impl Validate for VerificationTarget {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let VerificationTarget {
            claim_event_key,
            target_identities,
        } = self;
        if let Some(event_key) = claim_event_key.as_ref() {
            event_key.validate_check(errors, |err| map_err(ValidationError::ClaimEventKey(err)));
            if event_key.collection != collections::VERIFICATIONS {
                errors.push(map_err(ValidationError::ClaimEventKey(
                    event_key::ValidationError::CollectionInvalid {
                        expected: collections::VERIFICATIONS,
                    },
                )));
            }
        } else {
            errors.push(map_err(ValidationError::ClaimEventKeyMissing));
        }
        validate::slice2(
            target_identities,
            errors,
            |err| map_err(ValidationError::TargetIdentities(err)),
            |index, error| map_err(ValidationError::TargetIdentitiesItem { index, error }),
            SliceConfig {
                min_len: Some(1),
                max_len: Some(100),
                ..Default::default()
            },
            |target_identity, errors, map_err| validate::identity(target_identity, errors, map_err),
        );
    }
}

#[derive(Debug)]
pub enum ValidationError {
    ClaimEventKey(event_key::ValidationError),
    ClaimEventKeyMissing,
    TargetIdentities(SliceError),
    TargetIdentitiesItem { index: u32, error: StringError },
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::ClaimEventKey(err) => write!(f, "claim event key {err}"),
            ValidationError::ClaimEventKeyMissing => write!(f, "claim event key is missing"),
            ValidationError::TargetIdentities(err) => write!(f, "target identities {err}"),
            ValidationError::TargetIdentitiesItem {
                index,
                error: StringError::FailsRegex { .. },
            } => {
                write!(f, "target identities {index}-th is not a valid identity")
            }
            ValidationError::TargetIdentitiesItem { index, error } => {
                write!(f, "target identities {index}-th {error}")
            }
        }
    }
}
