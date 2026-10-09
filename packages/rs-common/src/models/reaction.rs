use std::fmt;

use crate::models::event_key;
use crate::models::protos_v2::Reaction;
use crate::models::validate::Validate;

impl Validate for Reaction {
    type Error = ValidationError;

    fn validate_check<E, F>(&self, errors: &mut Vec<E>, map_err: F)
    where
        F: Fn(Self::Error) -> E,
    {
        let Reaction {
            event_key,
            emoji,
            positive: _,
        } = self;
        if let Some(event_key) = event_key.as_ref() {
            event_key.validate_check(errors, |err| map_err(ValidationError::EventKey(err)))
        } else {
            errors.push(map_err(ValidationError::EventKeyMissing));
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
    EventKey(event_key::ValidationError),
    EventKeyMissing,
    EmojiEmpty,
    EmojiTooLong,
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::EventKey(err) => write!(f, "event key {err}"),
            ValidationError::EventKeyMissing => write!(f, "event key is missing"),
            ValidationError::EmojiEmpty => write!(f, "emoji can't be empty"),
            ValidationError::EmojiTooLong => write!(f, "emoji can't be longer than 1 character"),
        }
    }
}
