use std::fmt;

use crate::models::protos_v2::VerificationVerify;
use crate::models::validate::Validate;
use crate::models::{collections, event_key};

impl Validate for VerificationVerify {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let VerificationVerify { claim_event_key } = self;
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
    }
}

#[derive(Debug)]
pub enum ValidationError {
    ClaimEventKey(event_key::ValidationError),
    ClaimEventKeyMissing,
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::ClaimEventKey(err) => write!(f, "claim event key {err}"),
            ValidationError::ClaimEventKeyMissing => write!(f, "claim event key is missing"),
        }
    }
}
