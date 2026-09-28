use std::fmt;

use crate::models::event_key;
use crate::models::protos_v2::PostReply;
use crate::models::validate::Validate;

impl Validate for PostReply {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let PostReply { root, parent } = self;
        if let Some(root) = root {
            root.validate_check(errors, |err| map_err(ValidationError::Root(err)));
        } else {
            errors.push(map_err(ValidationError::RootMissing));
        }
        if let Some(parent) = parent {
            parent.validate_check(errors, |err| map_err(ValidationError::Parent(err)));
        } else {
            errors.push(map_err(ValidationError::ParentMissing));
        }
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
