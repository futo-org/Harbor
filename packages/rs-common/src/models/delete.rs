use std::fmt;

use crate::models::event_key;
use crate::models::protos_v2::Delete;
use crate::models::validate::Validate;

impl Validate for Delete {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let Delete { event_key } = self;
        if let Some(event_key) = event_key.as_ref() {
            event_key.validate_check(errors, |err| map_err(ValidationError::EventKey(err)))
        } else {
            errors.push(map_err(ValidationError::EventKeyMissing));
        }
    }
}

#[derive(Debug)]
pub enum ValidationError {
    EventKey(event_key::ValidationError),
    EventKeyMissing,
    IdentityMismatch,
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::EventKey(err) => write!(f, "event key {err}"),
            ValidationError::EventKeyMissing => write!(f, "event key is missing"),
            ValidationError::IdentityMismatch => write!(f, "event key identity mismatch"),
        }
    }
}
