use std::fmt;

use crate::models::event_key;
use crate::models::protos_v2::PostReply;
use crate::models::validate::Validate;

impl Validate for PostReply {
    type Error = ValidationError;

    fn validate(&self) -> Result<(), Self::Error> {
        let PostReply { root, parent } = self;
        if let Some(root) = root {
            Validate::validate(root).map_err(ValidationError::Root)?;
        } else {
            return Err(ValidationError::RootMissing);
        }
        if let Some(parent) = parent {
            Validate::validate(parent).map_err(ValidationError::Parent)?;
        } else {
            return Err(ValidationError::ParentMissing);
        }
        Ok(())
    }
}

#[derive(Debug)]
pub enum ValidationError {
    Root(event_key::ValidationError),
    RootMissing,
    Parent(event_key::ValidationError),
    ParentMissing,
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Root(err) => write!(f, "root {err}"),
            ValidationError::RootMissing => write!(f, "root is missing"),
            ValidationError::Parent(err) => write!(f, "parent {err}"),
            ValidationError::ParentMissing => write!(f, "parent is missing"),
        }
    }
}
