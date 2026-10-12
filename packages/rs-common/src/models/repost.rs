use std::fmt;

use crate::models::event_key;
use crate::models::protos_v2::Repost;
use crate::models::validate::Validate;

impl Validate for Repost {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let Repost { post } = self;
        if let Some(post) = post {
            post.validate_check(errors, |err| map_err(ValidationError::Post(err)));
        } else {
            errors.push(map_err(ValidationError::PostMissing));
        }
    }
}

#[derive(Debug)]
pub enum ValidationError {
    Post(event_key::ValidationError),
    PostMissing,
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Post(err) => write!(f, "post {err}"),
            ValidationError::PostMissing => write!(f, "post is missing"),
        }
    }
}
