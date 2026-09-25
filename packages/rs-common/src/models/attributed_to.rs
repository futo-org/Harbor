use std::fmt;

use crate::models::protos_v2::AttributedTo;
use crate::models::to;
use crate::models::validate::Validate;

impl Validate for AttributedTo {
    type Error = ValidationError;

    fn validate(&self) -> Result<(), Self::Error> {
        let AttributedTo { to } = self;
        if let Some(to) = to {
            to.validate().map_err(ValidationError::To)?;
        } else {
            return Err(ValidationError::ToMissing);
        }
        Ok(())
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
