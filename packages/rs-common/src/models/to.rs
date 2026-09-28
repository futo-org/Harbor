use std::fmt;

use crate::models::link;
use crate::models::protos_v2::attributed_to::To;
use crate::models::validate::Validate;

impl Validate for To {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        match self {
            To::Link(link) => {
                link.validate_check(errors, |err| map_err(ValidationError::Link(err)))
            }
        }
    }
}

#[derive(Debug)]
pub enum ValidationError {
    Link(link::ValidationError),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Link(err) => write!(f, "link {err}"),
        }
    }
}
