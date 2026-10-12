use std::fmt;

use crate::models::attributed_to;
use crate::models::protos_v2::AttributedToReaction;
use crate::models::validate::Validate;

impl Validate for AttributedToReaction {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let AttributedToReaction {
            attributed_to,
            emoji,
            positive: _,
        } = self;

        if let Some(attributed_to) = attributed_to.as_ref() {
            attributed_to.validate_check(errors, |err| map_err(ValidationError::AttributedTo(err)))
        } else {
            errors.push(map_err(ValidationError::AttributedToMissing));
        }

        if let Some(emoji) = emoji.as_ref() {
            if emoji.is_empty() {
                errors.push(map_err(ValidationError::EmojiEmpty));
            } else if emoji.chars().count() != 1 {
                errors.push(map_err(ValidationError::EmojiTooLong));
            }
        }
    }
}

#[derive(Debug)]
pub enum ValidationError {
    AttributedTo(attributed_to::ValidationError),
    AttributedToMissing,
    EmojiEmpty,
    EmojiTooLong,
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::AttributedTo(err) => write!(f, "attributed to {err}"),
            ValidationError::AttributedToMissing => write!(f, "attributed to is missing"),
            ValidationError::EmojiEmpty => write!(f, "emoji can't be empty"),
            ValidationError::EmojiTooLong => write!(f, "emoji can't be longer than 1 character"),
        }
    }
}
