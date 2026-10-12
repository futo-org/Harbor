use std::fmt;

use crate::models::protos_v2::Block;
use crate::models::validate::{self, Validate};

impl Validate for Block {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let Block { identity } = self;
        validate::identity(identity, errors, |err| {
            map_err(ValidationError::Identity(err))
        });
    }
}

#[derive(Debug)]
pub enum ValidationError {
    Identity(validate::StringError),
    IdentitySelf,
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Identity(validate::StringError::FailsRegex { .. }) => {
                write!(f, "identity is not a valid identity")
            }
            ValidationError::Identity(err) => write!(f, "identity {err}"),
            ValidationError::IdentitySelf => write!(f, "identity is invalid, can't block yourself"),
        }
    }
}
