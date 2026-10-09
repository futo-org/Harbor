use std::fmt;

use crate::models::protos_v2::content::ContentBody;
use crate::models::validate::Validate;
use crate::models::{block, delete, follow, post, reaction};

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
            ContentBody::Follow(follow) => {
                follow.validate_check(errors, |err| map_err(ValidationError::Follow(err)))
            }
            ContentBody::Block(block) => {
                block.validate_check(errors, |err| map_err(ValidationError::Block(err)))
            }
            ContentBody::Reaction(reaction) => {
                reaction.validate_check(errors, |err| map_err(ValidationError::Reaction(err)))
            }
            _ => { /* TODO. */ }
        }
    }
}

#[derive(Debug)]
pub enum ValidationError {
    Post(post::ValidationError),
    Delete(delete::ValidationError),
    Follow(follow::ValidationError),
    Block(block::ValidationError),
    Reaction(reaction::ValidationError),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Post(err) => write!(f, "post {err}"),
            ValidationError::Delete(err) => write!(f, "delete {err}"),
            ValidationError::Follow(err) => write!(f, "follow {err}"),
            ValidationError::Block(err) => write!(f, "block {err}"),
            ValidationError::Reaction(err) => write!(f, "reaction {err}"),
        }
    }
}
