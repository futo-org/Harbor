use std::fmt;

use crate::models::protos_v2::AttributedTo;
use crate::models::to;
use crate::models::validate::Validate;

impl Validate for AttributedTo {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let AttributedTo { to } = self;
        if let Some(to) = to {
            to.validate_check(errors, |err| map_err(ValidationError::To(err)));
        } else {
            errors.push(map_err(ValidationError::ToMissing));
        }
    }
}

#[derive(Debug)]
pub enum ValidationError {
    To(to::ValidationError),
    ToMissing,
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::To(err) => write!(f, "to {err}"),
            ValidationError::ToMissing => write!(f, "to is missing"),
        }
    }
}
