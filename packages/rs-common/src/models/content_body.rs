use std::fmt;

use crate::models::post;
use crate::models::protos_v2::content::ContentBody;
use crate::models::validate::Validate;

impl Validate for ContentBody {
    type Error = ValidationError;

    fn validate(&self) -> Result<(), Self::Error> {
        match self {
            ContentBody::Post(post) => post.validate().map_err(ValidationError::Post),
            _ => Ok(()), // TODO.
        }
    }
}

#[derive(Debug)]
pub enum ValidationError {
    Post(post::ValidationError),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Post(err) => write!(f, "post {err}"),
        }
    }
}
