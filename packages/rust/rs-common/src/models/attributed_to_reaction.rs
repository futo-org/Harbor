use std::fmt;

use crate::models::attributed_to;
use crate::models::protos_v2::AttributedToReaction;
use crate::models::validate::{self, StringError, Validate};

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
            validate::emoji(emoji, errors, |err| map_err(ValidationError::Emoji(err)));
        }
    }
}

#[derive(Debug)]
#[cfg_attr(feature = "uniffi", derive(uniffi::Enum))]
#[cfg_attr(
    feature = "uniffi",
    uniffi(name = "AttributedToReactionValidationError")
)]
pub enum ValidationError {
    AttributedTo(attributed_to::ValidationError),
    AttributedToMissing,
    Emoji(StringError),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::AttributedTo(err) => write!(f, "attributed to {err}"),
            ValidationError::AttributedToMissing => write!(f, "attributed to is missing"),
            ValidationError::Emoji(err) => write!(f, "emoji {err}"),
        }
    }
}
