use std::fmt;

use crate::models::protos_v2::content::ContentBody;
use crate::models::validate::Validate;
use crate::models::{delete, post};

impl Validate for ContentBody {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        match self {
            ContentBody::Post(post) => {
                post.validate_check(errors, |err| map_err(ValidationError::Post(err)))
            }
            ContentBody::Delete(delete) => {
                delete.validate_check(errors, |err| map_err(ValidationError::Delete(err)))
            }
            _ => { /* TODO. */ }
        }
    }
}

#[derive(Debug)]
pub enum ValidationError {
    Post(post::ValidationError),
    Delete(delete::ValidationError),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Post(err) => write!(f, "post {err}"),
            ValidationError::Delete(err) => write!(f, "delete {err}"),
        }
    }
}
